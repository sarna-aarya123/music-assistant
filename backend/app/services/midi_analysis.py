"""MIDI feature extraction + feel/mood interpretation.

Phase 1 — see PLAN.md and docs/FEATURE_MIDI_ANALYZER.md for the full spec.

Deterministic features (tempo, time signature, key, density, range, velocity, track count) are
extracted with pretty_midi and never touch the LLM — only the "feel"/mood narrative and
suggestions come from Ollama, grounded in those features via the prompt.
"""

import json
import math
from pathlib import Path

import pretty_midi

from app.models.schemas import MidiAnalysisResponse
from app.services import ollama_client

# Krumhansl-Kessler key profiles: relative "weight" of each pitch class (starting at the tonic)
# in a typical major/minor melody. Correlating a track's pitch-class histogram against rotated
# copies of these profiles is the standard cheap key-estimation approach.
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_SYSTEM_PROMPT = (
    "You are an experienced music producer friend who specializes in rage/plugg/trap production "
    "(reference points: Ken Carson, Playboi Carti, OsamaSon, Draco FM). A producer just handed "
    "you a table of objective features extracted from a MIDI file they're working on. Give them "
    "a plain-English read on the feel/mood, plus a couple of concrete suggestions. Sound like a "
    "peer giving real notes, not a textbook. Be specific, not generic. "
    "Respond with ONLY valid JSON (no markdown code fences, no extra commentary) in exactly this "
    'shape: {"feel_summary": "one short sentence", "notes": "2-4 sentence paragraph", '
    '"suggestions": ["suggestion 1", "suggestion 2"]}'
)


def _pitch_class_histogram(instruments: list) -> list[float]:
    """Duration-weighted pitch-class histogram across all non-drum notes."""
    histogram = [0.0] * 12
    for instrument in instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
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
    total_notes = sum(len(inst.notes) for inst in instruments if not inst.is_drum)
    return round(total_notes / duration, 2) if duration > 0 else 0.0


def _pitch_range(instruments: list) -> tuple[str, str]:
    pitches = [note.pitch for inst in instruments if not inst.is_drum for note in inst.notes]
    if not pitches:
        return ("N/A", "N/A")
    return (
        pretty_midi.note_number_to_name(min(pitches)),
        pretty_midi.note_number_to_name(max(pitches)),
    )


def _avg_velocity(instruments: list) -> int:
    velocities = [note.velocity for inst in instruments for note in inst.notes]
    return round(sum(velocities) / len(velocities)) if velocities else 0


async def _interpret_features(feature_summary: str) -> tuple[bool, str, str, list[str]]:
    """Ask Ollama for a feel/mood read on top of the deterministic features.

    This is a pure enhancement — MIDI analysis works fully without it. If Ollama isn't installed
    or isn't running locally, this fails fast (connection refused, no long timeout) and the caller
    falls back to the deterministic features alone with `ai_available=False`.
    """
    try:
        raw = await ollama_client.generate(feature_summary, system=_SYSTEM_PROMPT)
    except ollama_client.OllamaError:
        return False, "", "", []

    try:
        data = ollama_client.parse_json_response(raw)
        return (
            True,
            str(data.get("feel_summary", "")).strip(),
            str(data.get("notes", "")).strip(),
            [str(s).strip() for s in data.get("suggestions", [])],
        )
    except (json.JSONDecodeError, AttributeError):
        # Ollama IS reachable here, it just returned something unparseable — distinct from the
        # "not available at all" case above, so still report ai_available=True.
        return True, "Feel summary unavailable — the model returned unparseable output.", raw.strip(), []


async def analyze_midi(file_path: Path) -> MidiAnalysisResponse:
    midi_data = pretty_midi.PrettyMIDI(str(file_path))

    bpm = _tempo(midi_data)
    time_signature = _time_signature(midi_data)
    key = estimate_key(midi_data.instruments)
    duration = midi_data.get_end_time()
    note_density = _note_density(midi_data.instruments, duration)
    pitch_range = _pitch_range(midi_data.instruments)
    avg_velocity = _avg_velocity(midi_data.instruments)
    track_count = len(midi_data.instruments)

    feature_summary = (
        f"BPM: {bpm:.1f}\n"
        f"Time signature: {time_signature}\n"
        f"Key estimate: {key}\n"
        f"Note density: {note_density} notes/sec\n"
        f"Pitch range: {pitch_range[0]} to {pitch_range[1]}\n"
        f"Average velocity (0-127): {avg_velocity}\n"
        f"Track/instrument count: {track_count}\n"
        f"Duration: {duration:.1f}s"
    )
    ai_available, feel_summary, notes, suggestions = await _interpret_features(feature_summary)

    return MidiAnalysisResponse(
        bpm=round(bpm, 1),
        time_signature=time_signature,
        key=key,
        note_density=note_density,
        pitch_range=pitch_range,
        avg_velocity=avg_velocity,
        ai_available=ai_available,
        track_count=track_count,
        feel_summary=feel_summary,
        notes=notes,
        suggestions=suggestions,
    )
