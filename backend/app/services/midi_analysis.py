"""MIDI feature extraction + a rule-based feel/mood read, entirely in pure Python.

Every field on `MidiAnalysisResponse` is computed deterministically with `pretty_midi` — there is
no model call anywhere in this module. `feel_summary`/`notes`/`suggestions` used to come from an
LLM prompted with the extracted features; they're now produced by `_describe_features()`, a plain
threshold-based text generator working off the same numbers. This keeps the response shape stable
for the frontend while making the whole feature AI-free.
"""

import math
from pathlib import Path

import pretty_midi

from app.models.schemas import MidiAnalysisResponse

# Krumhansl-Kessler key profiles: relative "weight" of each pitch class (starting at the tonic)
# in a typical major/minor melody. Correlating a track's pitch-class histogram against rotated
# copies of these profiles is the standard cheap key-estimation approach.
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _non_drum_notes(instruments: list) -> list:
    return [note for inst in instruments if not inst.is_drum for note in inst.notes]


def _pitch_class_histogram(instruments: list) -> list[float]:
    """Duration-weighted pitch-class histogram across all non-drum notes."""
    histogram = [0.0] * 12
    for note in _non_drum_notes(instruments):
        duration = max(note.end - note.start, 0.01)
        histogram[note.pitch % 12] += duration
    return histogram


def _correlate(a: list[float], b: list[float]) -> float:
    mean_a = sum(a) / len(a)
    mean_b = sum(b) / len(b)
    numerator = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    denom = math.sqrt(sum((x - mean_a) ** 2 for x in a)) * math.sqrt(sum((y - mean_b) ** 2 for y in b))
    return numerator / denom if denom else 0.0


def estimate_key(instruments: list) -> str:
    histogram = _pitch_class_histogram(instruments)
    if sum(histogram) == 0:
        return "Unknown"

    best_score = -2.0
    best_label = "Unknown"
    for tonic in range(12):
        for profile, mode in ((_MAJOR_PROFILE, "major"), (_MINOR_PROFILE, "minor")):
            rotated = [profile[(i - tonic) % 12] for i in range(12)]
            score = _correlate(histogram, rotated)
            if score > best_score:
                best_score = score
                best_label = f"{_NOTE_NAMES[tonic]} {mode}"
    return best_label


def _tempo(midi_data: pretty_midi.PrettyMIDI) -> float:
    # Prefer the file's actual tempo meta-event (what a DAW writes on export) over
    # estimate_tempo(), which infers BPM from note-onset spacing and is unreliable for short or
    # sparse clips — it only kicks in as a fallback for files with no tempo event at all.
    _, tempi = midi_data.get_tempo_changes()
    if len(tempi):
        return float(tempi[0])
    try:
        bpm = float(midi_data.estimate_tempo())
        if bpm > 0:
            return bpm
    except ValueError:
        pass
    return 120.0


def _time_signature(midi_data: pretty_midi.PrettyMIDI) -> str:
    if midi_data.time_signature_changes:
        ts = midi_data.time_signature_changes[0]
        return f"{ts.numerator}/{ts.denominator}"
    return "4/4"


def _note_density(instruments: list, duration: float) -> float:
    total_notes = len(_non_drum_notes(instruments))
    return round(total_notes / duration, 2) if duration > 0 else 0.0


def _pitch_range(instruments: list) -> tuple[str, str]:
    pitches = [note.pitch for note in _non_drum_notes(instruments)]
    if not pitches:
        return ("N/A", "N/A")
    return (
        pretty_midi.note_number_to_name(min(pitches)),
        pretty_midi.note_number_to_name(max(pitches)),
    )


def _avg_velocity(instruments: list) -> int:
    velocities = [note.velocity for inst in instruments for note in inst.notes]
    return round(sum(velocities) / len(velocities)) if velocities else 0


def _velocity_range(instruments: list) -> tuple[int, int]:
    velocities = [note.velocity for inst in instruments for note in inst.notes]
    return (min(velocities), max(velocities)) if velocities else (0, 0)


def _unique_pitch_classes(instruments: list) -> int:
    return len({note.pitch % 12 for note in _non_drum_notes(instruments)})


def _avg_note_length(instruments: list) -> float:
    notes = _non_drum_notes(instruments)
    if not notes:
        return 0.0
    return round(sum(note.end - note.start for note in notes) / len(notes), 3)


def _polyphony(instruments: list) -> int:
    """Max number of non-drum notes sounding at the same instant, via a sweep line."""
    events: list[tuple[float, int]] = []
    for note in _non_drum_notes(instruments):
        events.append((note.start, 1))
        events.append((note.end, -1))
    if not events:
        return 0
    # Note-off events (-1) sort before note-on events (1) at the same timestamp so a note ending
    # exactly when another starts isn't double-counted as simultaneous.
    events.sort(key=lambda e: (e[0], e[1]))
    current = peak = 0
    for _, delta in events:
        current += delta
        peak = max(peak, current)
    return peak


def _syncopation(instruments: list, bpm: float) -> float:
    """Fraction of note onsets that land on an off-beat eighth-note subdivision rather than a beat.

    A simplified proxy for syncopation: quantizes each onset to the nearest 16th-note grid point
    and checks whether that point is a full beat (on-beat) or an "and" (off-beat). Doesn't account
    for meter/accent weighting the way a music-theory-grade syncopation score would.
    """
    notes = _non_drum_notes(instruments)
    if not notes or bpm <= 0:
        return 0.0
    beat_sec = 60.0 / bpm
    sixteenth = beat_sec / 4
    off_beat_count = 0
    for note in notes:
        grid_index = round(note.start / sixteenth)
        # On-beat = falls on a quarter-note grid point (every 4th sixteenth); everything else,
        # including the "and" of the beat, counts as off-beat.
        if grid_index % 4 != 0:
            off_beat_count += 1
    return round(off_beat_count / len(notes), 2)


def _describe_features(
    bpm: float,
    key: str,
    note_density: float,
    avg_velocity: int,
    velocity_range: tuple[int, int],
    avg_note_length_sec: float,
    polyphony: int,
    syncopation: float,
    unique_pitch_classes: int,
    duration: float,
) -> tuple[str, str, list[str]]:
    """Rule-based feel/mood read — plain Python thresholds on the extracted features, no model call."""
    mode = "minor" if "minor" in key else "major" if "major" in key else None

    if bpm < 80:
        tempo_word = "slow, laid-back"
    elif bpm < 120:
        tempo_word = "mid-tempo"
    elif bpm < 150:
        tempo_word = "up-tempo, energetic"
    else:
        tempo_word = "fast, high-energy"

    mood_word = "moody/dark" if mode == "minor" else "bright/uplifting" if mode == "major" else "tonally ambiguous"
    density_word = "sparse" if note_density < 2 else "moderately dense" if note_density < 6 else "busy"
    texture_word = "monophonic" if polyphony <= 1 else "thin harmony" if polyphony <= 3 else "dense/chordal"

    feel_summary = f"{tempo_word.capitalize()} and {mood_word}, with a {density_word} {texture_word} texture."

    sentences = []
    sentences.append(
        f"At {bpm:.0f} BPM in {key}, this reads as {tempo_word} and {mood_word}."
    )
    sentences.append(
        f"Note density is {note_density} notes/sec ({density_word}), with up to {polyphony} notes "
        f"overlapping at once ({texture_word})."
    )
    if syncopation >= 0.4:
        rhythm_note = f"A large share of onsets ({syncopation * 100:.0f}%) land off the beat, giving it a syncopated, groove-forward feel."
    elif syncopation >= 0.15:
        rhythm_note = f"Some onsets ({syncopation * 100:.0f}%) land off the beat, adding light syncopation."
    else:
        rhythm_note = f"Onsets mostly land on the beat ({(1 - syncopation) * 100:.0f}% on-grid), giving it a straight, four-on-the-floor feel."
    sentences.append(rhythm_note)

    vel_span = velocity_range[1] - velocity_range[0]
    if vel_span < 20:
        sentences.append(f"Velocity stays tight ({velocity_range[0]}-{velocity_range[1]}), fairly flat dynamics.")
    else:
        sentences.append(f"Velocity ranges {velocity_range[0]}-{velocity_range[1]}, decent dynamic contrast.")

    notes = " ".join(sentences)

    suggestions: list[str] = []
    if polyphony <= 1:
        suggestions.append("This is monophonic — try layering a harmony or counter-melody.")
    if unique_pitch_classes <= 3:
        suggestions.append("Only a few distinct pitch classes are in use — could open up the melodic range.")
    if vel_span < 15:
        suggestions.append("Velocity is very flat — add some accent/dynamic variation so it doesn't feel robotic.")
    if note_density < 1 and duration > 8:
        suggestions.append("Fairly sparse for the track length — could support more movement in a quieter section.")
    if syncopation < 0.1 and bpm >= 120:
        suggestions.append("Rhythmically very on-grid for the tempo — some syncopation could add groove.")
    if not suggestions:
        suggestions.append("No obvious gaps — the arrangement already has decent range, rhythm, and dynamics.")

    return feel_summary, notes, suggestions[:4]


async def analyze_midi(file_path: Path) -> MidiAnalysisResponse:
    midi_data = pretty_midi.PrettyMIDI(str(file_path))

    bpm = _tempo(midi_data)
    time_signature = _time_signature(midi_data)
    key = estimate_key(midi_data.instruments)
    duration = midi_data.get_end_time()
    note_density = _note_density(midi_data.instruments, duration)
    pitch_range = _pitch_range(midi_data.instruments)
    avg_velocity = _avg_velocity(midi_data.instruments)
    velocity_range = _velocity_range(midi_data.instruments)
    track_count = len(midi_data.instruments)
    unique_pitch_classes = _unique_pitch_classes(midi_data.instruments)
    avg_note_length_sec = _avg_note_length(midi_data.instruments)
    polyphony = _polyphony(midi_data.instruments)
    syncopation = _syncopation(midi_data.instruments, bpm)

    feel_summary, notes, suggestions = _describe_features(
        bpm=bpm,
        key=key,
        note_density=note_density,
        avg_velocity=avg_velocity,
        velocity_range=velocity_range,
        avg_note_length_sec=avg_note_length_sec,
        polyphony=polyphony,
        syncopation=syncopation,
        unique_pitch_classes=unique_pitch_classes,
        duration=duration,
    )

    return MidiAnalysisResponse(
        bpm=round(bpm, 1),
        time_signature=time_signature,
        key=key,
        note_density=note_density,
        pitch_range=pitch_range,
        avg_velocity=avg_velocity,
        track_count=track_count,
        unique_pitch_classes=unique_pitch_classes,
        velocity_range=velocity_range,
        avg_note_length_sec=avg_note_length_sec,
        polyphony=polyphony,
        syncopation=syncopation,
        feel_summary=feel_summary,
        notes=notes,
        suggestions=suggestions,
    )
