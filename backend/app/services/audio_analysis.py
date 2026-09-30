"""Audio feature extraction + a rule-based feedback read, entirely in pure Python.

Every field on `CoachFeedbackResponse` is computed deterministically with `librosa` — there is no
model call anywhere in the feedback path. `strengths`/`improvements` used to come from an LLM
prompted with the extracted features; they're now produced by `_describe_features()`, a plain
threshold-based text generator working off the same numbers.

`continue_chat()` and `_track_context` are kept below, unused by any router, so a chat feature can
be reconnected later without redesigning this module — see `app/services/ollama_client.py` for the
same "kept but disconnected" treatment of the underlying Ollama client.
"""

import math
from pathlib import Path

import anyio
import librosa
import numpy as np

from app.models.schemas import ChatMessage, CoachFeedbackResponse, SegmentFeatures, TrackFeatures, TrackSegment
from app.services import history, ollama_client

# Krumhansl-Kessler key profiles — same approach as the MIDI Analyzer, applied to a chroma
# spectrogram instead of a MIDI pitch-class histogram.
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_LOW_END_CUTOFF_HZ = 150.0

# Fixed decode rate instead of the file's native sample rate — halves (or more) the size of every
# array `_extract` allocates below, which matters on a 512MB Render instance. All the features we
# read (BPM, key, RMS, spectral shape, onsets) are well below the 11kHz Nyquist this leaves.
_TARGET_SR = 22050

# Full-track analysis on a 512MB instance is memory-bound by track length, not just file size (a
# small compressed file can still decode to a long, large PCM array) — cap duration directly.
# 5 minutes covers virtually any single reference track/loop a producer would upload here.
_MAX_DURATION_SEC = 300.0

_CHAT_SYSTEM_PROMPT_TEMPLATE = (
    "You are an experienced music producer friend continuing a conversation about a specific "
    "track. Stay grounded in the extracted features and the feedback you already gave below — "
    "don't contradict them, and if the producer asks something the features can't answer, say so "
    "rather than guessing.\n\n{context}"
)

# In-memory grounding context for chat, keyed by track_id — the extracted features plus whatever
# feedback was already given. Not currently populated by any active route (chat is disconnected);
# `generate_feedback` still fills it in so `continue_chat` works immediately once chat is
# reconnected, without needing every existing track re-analyzed first.
_track_context: dict[str, str] = {}


class AudioLoadError(RuntimeError):
    """Raised when the uploaded file can't be decoded as audio."""


def _correlate(a: list[float], b: list[float]) -> float:
    mean_a = sum(a) / len(a)
    mean_b = sum(b) / len(b)
    numerator = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    denom = math.sqrt(sum((x - mean_a) ** 2 for x in a)) * math.sqrt(sum((y - mean_b) ** 2 for y in b))
    return numerator / denom if denom else 0.0


def _estimate_key(chroma_mean: np.ndarray) -> str:
    histogram = [float(x) for x in chroma_mean]
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


def _low_end_ratio(spec_mag: np.ndarray, freqs: np.ndarray) -> float:
    """Fraction of total spectral energy sitting below `_LOW_END_CUTOFF_HZ`."""
    energy = spec_mag**2
    total = float(np.sum(energy))
    if total == 0:
        return 0.0
    low_mask = freqs < _LOW_END_CUTOFF_HZ
    low_energy = float(np.sum(energy[low_mask, :]))
    return round(low_energy / total, 3)


# Coarser hop than the librosa default (512), applied only to the shared chroma/centroid/rolloff/
# low-end STFT below — NOT to the onset envelope (beat_track/onset_detect keep 512, since onset
# timing — relevant to dense hi-hat-roll passages in this genre — is time-resolution-sensitive in a
# way these mean-aggregated spectral stats aren't). Measured: halves that STFT's array size, with
# brightness_hz/rolloff_hz shifting by <0.1Hz and key/low_end_ratio unchanged on a real test track
# (see tests/test_coach_audio.py's spectral-equivalence tests).
_SPECTRAL_HOP_LENGTH = 1024

# Segment/"mark" detection — the full-song map's clickable points of interest. Tuned for a typical
# 1.5-4min beat/song: enough marks to be useful without cluttering the timeline, spaced apart
# enough that each segment is long enough to describe meaningfully.
_MAX_MARKS = 7
_MIN_SEGMENT_SEC = 6.0
_EDGE_GUARD_SEC = 4.0  # ignore boundaries this close to the very start/end — not useful marks


def _spectral_features(y: np.ndarray, sr: int) -> dict:
    """Key/brightness/rolloff/low-end-ratio, all derived from one shared magnitude spectrogram.

    Scoped in its own function rather than inline in `_extract` so the STFT and its derived arrays
    (the biggest allocation in the whole analysis) are released — via CPython dropping this frame's
    locals — the instant this returns, instead of sitting alive as `_extract`'s own locals for the
    rest of that function's execution (including through the onset-detection pass after this).
    """
    stft = np.abs(librosa.stft(y, hop_length=_SPECTRAL_HOP_LENGTH))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=(stft.shape[0] - 1) * 2)

    # chroma_stft's default S is a *power* spectrogram (magnitude**2); centroid/rolloff default to
    # magnitude (power=1) — squaring here is a cheap elementwise op on an array we already have,
    # far cheaper than re-running librosa.stft a second time.
    #
    # `tuning=0` intentionally disables chroma_stft's automatic tuning estimation. By default
    # (tuning=None) it runs its own internal pitch-tracking pass over the full spectrogram to
    # detect per-track tuning drift from standard 440Hz/12-TET — measured to be the single largest
    # allocation in this entire analysis (larger than the STFT computation it's built on top of),
    # roughly 200MB+ of extra transient arrays on a multi-minute track. `_estimate_key` only needs
    # coarse, semitone-resolution chroma bins to correlate against the fixed Krumhansl-Kessler
    # major/minor profiles above — it has no use for cents-level tuning correction. Tradeoff: a
    # track deliberately pitched/detuned meaningfully off standard tuning could get a marginally
    # less accurate key estimate; for this app's genre (produced electronic/trap, effectively
    # always at standard pitch) that's expected to be immaterial in practice, and verified to
    # produce the same key label and near-identical chroma histogram on a real test track.
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, S=stft**2, hop_length=_SPECTRAL_HOP_LENGTH, tuning=0)
    key = _estimate_key(chroma.mean(axis=1))

    # Kept as a frame-wise array (not just its mean) — a 1D array of a few thousand floats at most,
    # negligible next to the 2D STFT/chroma matrices above, and it's what segment boundary
    # detection below correlates against alongside frame-wise RMS. Freed along with everything
    # else here once `_extract` is done with it; nowhere near the size that mattered for the
    # OOM work this app's memory budget was originally tuned against.
    centroid_frames = librosa.feature.spectral_centroid(y=y, sr=sr, S=stft, hop_length=_SPECTRAL_HOP_LENGTH)[0]
    brightness_hz = round(float(np.mean(centroid_frames)), 1)
    rolloff_hz = round(
        float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, S=stft, hop_length=_SPECTRAL_HOP_LENGTH))), 1
    )
    low_end_ratio = _low_end_ratio(stft, freqs)

    return {
        "key": key,
        "brightness_hz": brightness_hz,
        "rolloff_hz": rolloff_hz,
        "low_end_ratio": low_end_ratio,
        "centroid_frames": centroid_frames,
    }


def _smooth(x: np.ndarray, window: int) -> np.ndarray:
    if len(x) < window:
        return x
    kernel = np.ones(window) / window
    return np.convolve(x, kernel, mode="same")


def _normalize(x: np.ndarray) -> np.ndarray:
    span = float(x.max() - x.min())
    return (x - x.min()) / span if span > 0 else np.zeros_like(x)


_ENERGY_CURVE_POINTS = 240


def _energy_curve(rms: np.ndarray) -> list[float]:
    """Downsamples the already-computed frame-wise RMS into a fixed-length, 0-1-normalized curve
    covering the whole track — what the frontend's full-song map draws as its "long waveform"
    (it's actually a loudness-over-time curve, not a literal sample-accurate amplitude waveform,
    but reads the same way at this resolution and costs nothing extra to produce: `rms` already
    exists from the whole-track loudness calculation above, this just bins it down)."""
    if len(rms) == 0:
        return []
    bins = np.array_split(rms, min(_ENERGY_CURVE_POINTS, len(rms)))
    curve = np.array([float(np.mean(b)) for b in bins])
    peak = float(curve.max())
    if peak <= 0:
        return [0.0] * len(curve)
    return [round(float(v / peak), 3) for v in curve]


def _detect_segment_boundaries(rms: np.ndarray, centroid: np.ndarray, sr: int, hop_length: int, duration_sec: float) -> list[float]:
    """Finds structurally "interesting" moments — points where the track's loudness and/or tonal
    brightness change significantly — using frame-wise data already computed for the whole-track
    features above (no extra spectral pass). This is a novelty-curve approach: smooth both curves,
    take the frame-to-frame change in each, and pick local peaks in the combined change signal.
    Deliberately simple relative to full recurrence-matrix music segmentation (`librosa.segment`)
    — good enough to land marks near real transitions (a drop, a new section) without the extra
    O(n^2) cost a self-similarity matrix would add on a multi-minute track.
    """
    if len(rms) < 4 or duration_sec <= _EDGE_GUARD_SEC * 2:
        return []

    rms_s = _smooth(_normalize(rms), window=5)
    centroid_s = _smooth(_normalize(centroid), window=5)
    novelty = np.abs(np.diff(rms_s, prepend=rms_s[0])) + np.abs(np.diff(centroid_s, prepend=centroid_s[0]))
    novelty = _smooth(novelty, window=9)

    frames_per_sec = sr / hop_length
    min_spacing_frames = max(1, int(_MIN_SEGMENT_SEC * frames_per_sec))
    std = float(novelty.std())
    if std == 0:
        return []

    peak_frames = librosa.util.peak_pick(
        novelty,
        pre_max=min_spacing_frames,
        post_max=min_spacing_frames,
        pre_avg=min_spacing_frames,
        post_avg=min_spacing_frames,
        delta=std * 0.5,
        wait=min_spacing_frames,
    )
    if len(peak_frames) == 0:
        return []

    if len(peak_frames) > _MAX_MARKS:
        peak_frames = np.array(sorted(sorted(peak_frames, key=lambda f: -novelty[f])[:_MAX_MARKS]))

    times = librosa.frames_to_time(peak_frames, sr=sr, hop_length=hop_length)
    return [round(float(t), 2) for t in times if _EDGE_GUARD_SEC <= t <= duration_sec - _EDGE_GUARD_SEC]


def _segment_slice_features(
    y: np.ndarray, sr: int, start_sec: float, end_sec: float, onset_times: list[float], centroid: np.ndarray, hop_length: int
) -> dict:
    """Deterministic feature extraction scoped to one time window — the same style of numbers as
    the whole-track features, computed on just that slice, plus onset density reused from the
    whole-track onset list (just counted within this window) rather than redetected."""
    start_sample = int(start_sec * sr)
    end_sample = int(end_sec * sr)
    segment = y[start_sample:end_sample]
    segment_duration = max(end_sec - start_sec, 0.01)

    if len(segment) == 0 or not np.any(segment):
        return {"rms_db": -120.0, "brightness_hz": 0.0, "onset_density": 0.0, "zero_crossing_rate": 0.0}

    rms_mean = float(np.mean(librosa.feature.rms(y=segment)[0]))
    rms_db = round(20 * math.log10(rms_mean), 1) if rms_mean > 0 else -120.0

    start_frame = librosa.time_to_frames(start_sec, sr=sr, hop_length=hop_length)
    end_frame = librosa.time_to_frames(end_sec, sr=sr, hop_length=hop_length)
    centroid_slice = centroid[max(start_frame, 0) : min(end_frame, len(centroid))]
    brightness_hz = round(float(np.mean(centroid_slice)), 1) if len(centroid_slice) else 0.0

    onset_count = sum(1 for t in onset_times if start_sec <= t < end_sec)
    onset_density = round(onset_count / segment_duration, 2)

    zero_crossing_rate = round(float(np.mean(librosa.feature.zero_crossing_rate(y=segment))), 4)

    # Deliberately no per-segment key estimate: chroma-based key detection needs a real amount of
    # signal to be reliable, and a short/bass-heavy/percussive slice (this app's whole target
    # genre) reads as a false "key change" often enough that it did exactly that on a real test
    # track that was actually all one key throughout. The whole-track estimate (computed over the
    # full duration) stays reliable; this doesn't try to do the same thing on 10-20s of audio.
    return {
        "rms_db": rms_db,
        "brightness_hz": brightness_hz,
        "onset_density": onset_density,
        "zero_crossing_rate": zero_crossing_rate,
    }


def _describe_segment(seg: dict, whole: dict) -> list[str]:
    """Comparison-aware, segment-specific notes — this is the "insanely in depth" per-mark
    feedback, grounded in exactly how this window differs from the track as a whole, not just
    restating the same thresholds `_describe_features` already gives for the whole track."""
    notes: list[str] = []

    loud_delta = seg["rms_db"] - whole["rms_db"]
    if abs(loud_delta) >= 3:
        direction = "louder" if loud_delta > 0 else "quieter"
        notes.append(f"{abs(loud_delta):.1f} dB {direction} than the track average ({seg['rms_db']} dB here vs {whole['rms_db']} dB overall).")

    bright_delta = seg["brightness_hz"] - whole["brightness_hz"]
    if abs(bright_delta) >= 400:
        direction = "brighter" if bright_delta > 0 else "darker/warmer"
        notes.append(f"Noticeably {direction} than the rest of the track ({seg['brightness_hz']:.0f} Hz vs {whole['brightness_hz']:.0f} Hz average).")

    onset_ratio = seg["onset_density"] / whole["onset_density"] if whole["onset_density"] > 0 else 1.0
    if onset_ratio >= 1.4:
        notes.append(f"Busier than the rest of the song rhythmically ({seg['onset_density']}/sec here vs {whole['onset_density']}/sec average).")
    elif onset_ratio <= 0.7 and whole["onset_density"] > 0:
        notes.append(f"Sparser/more open than the rest of the song ({seg['onset_density']}/sec here vs {whole['onset_density']}/sec average).")

    if not notes:
        notes.append("Broadly consistent with the rest of the track — no standout difference in this window.")

    return notes[:4]


def _build_segments(
    y: np.ndarray,
    sr: int,
    boundary_times: list[float],
    duration_sec: float,
    onset_times: list[float],
    centroid: np.ndarray,
    hop_length: int,
    whole_track: dict,
) -> list[dict]:
    """Turns detected boundary times into described segments — [0, b1), [b1, b2), ..., [bN, end)."""
    edges = [0.0] + sorted(boundary_times) + [duration_sec]
    # Merge any segment that ended up too short (two boundaries landed close together).
    merged = [edges[0]]
    for edge in edges[1:]:
        if edge - merged[-1] < _MIN_SEGMENT_SEC:
            continue
        merged.append(edge)
    if merged[-1] != duration_sec:
        merged[-1] = duration_sec

    segments = []
    for start, end in zip(merged[:-1], merged[1:]):
        seg_features = _segment_slice_features(y, sr, start, end, onset_times, centroid, hop_length)
        segments.append(
            {
                "start_sec": round(start, 2),
                "end_sec": round(end, 2),
                "mark_sec": round(start, 2),
                "features": seg_features,
                "notes": _describe_segment(seg_features, whole_track),
            }
        )
    return segments


def _extract(file_path: Path) -> dict:
    """Deterministic feature extraction with librosa alone — no LLM involved."""
    # Cheap header/metadata probe before the full decode below — catches an oversized track before
    # we ever allocate a PCM array for it, rather than after. Best-effort: if the probe can't read
    # this format's duration up front (rare — some containers require a real decode either way),
    # fall through and let the full load below enforce nothing extra; the upload size cap in
    # routers/coach.py is still in effect as a backstop.
    try:
        probe_duration = librosa.get_duration(path=str(file_path))
    except Exception:
        probe_duration = None

    if probe_duration is not None and probe_duration > _MAX_DURATION_SEC:
        raise AudioLoadError(
            f"Audio is too long ({probe_duration / 60:.1f} min) — max supported length is "
            f"{_MAX_DURATION_SEC / 60:.0f} min."
        )

    try:
        y, sr = librosa.load(str(file_path), sr=_TARGET_SR, mono=True)
    except Exception as exc:  # librosa/soundfile/audioread raise several distinct error types,
        # several of which (e.g. NoBackendError) have an empty str() — always name the exception
        # type so the message is actually useful.
        detail = str(exc) or type(exc).__name__
        raise AudioLoadError(f"Could not decode audio file — is it a valid audio file? ({detail})") from exc

    if len(y) > 0 and (len(y) / sr) > _MAX_DURATION_SEC:
        # Belt-and-suspenders: the header probe above misses some formats/containers. Catch those
        # here too, after decode — later than ideal for memory, but still before the STFT/chroma/
        # onset passes below, which are the next-biggest allocations.
        raise AudioLoadError(
            f"Audio is too long ({len(y) / sr / 60:.1f} min) — max supported length is "
            f"{_MAX_DURATION_SEC / 60:.0f} min."
        )

    duration_sec = round(float(librosa.get_duration(y=y, sr=sr)), 2)

    # Silence/near-silent or empty clips: tempo/key/spectral features are meaningless on zero
    # signal, so short-circuit rather than let librosa produce noisy nonsense.
    if len(y) == 0 or not np.any(y):
        return {
            "duration_sec": duration_sec,
            "bpm": 0.0,
            "key": "Unknown",
            "rms_db": -120.0,
            "brightness_hz": 0.0,
            "rolloff_hz": 0.0,
            "zero_crossing_rate": 0.0,
            "dynamic_range_db": 0.0,
            "low_end_ratio": 0.0,
            "onset_density": 0.0,
            "onset_times": [],
            "beat_times": [],
            "segments": [],
            "energy_curve": [],
        }

    # `beat_track` and `onset_detect` each independently build an onset-strength envelope from
    # scratch by default (their own internal mel-spectrogram pass — a full spectral transform, not
    # a cheap step) — computing it once here and passing it to both via `onset_envelope=` removes
    # one of those two passes entirely. Numerically identical to before: both default to this exact
    # computation with the same `hop_length`, so this only deduplicates work, it doesn't change it.
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0
    # Beat timestamps (not just the aggregate BPM) — used by the frontend to draw a beat grid over
    # the waveform. Tiny payload (a few hundred floats even for a long track), no memory concern.
    beat_times = [round(float(t), 3) for t in librosa.frames_to_time(beat_frames, sr=sr)]

    # The STFT-derived features (key/brightness/rolloff/low-end) live in their own function so
    # their arrays — the single biggest allocation in this whole analysis — are freed the moment
    # that call returns, rather than lingering as live locals here through the rest of `_extract`.
    spectral = _spectral_features(y, sr)

    # Same hop length as the spectral pass (not librosa's default 512) so this frame-wise RMS
    # aligns index-for-index with `centroid_frames` below — both needed on the same time grid for
    # segment-boundary detection. Changes the aggregate rms_db/dynamic_range_db by an amount too
    # small to matter (same tradeoff already made for brightness/rolloff/key — see
    # _SPECTRAL_HOP_LENGTH's comment above).
    rms = librosa.feature.rms(y=y, hop_length=_SPECTRAL_HOP_LENGTH)[0]
    rms_mean = float(np.mean(rms))
    rms_db = round(20 * math.log10(rms_mean), 1) if rms_mean > 0 else -120.0

    peak = float(np.max(np.abs(y)))
    dynamic_range_db = round(20 * math.log10(peak / rms_mean), 1) if rms_mean > 0 and peak > 0 else 0.0

    zero_crossing_rate = round(float(np.mean(librosa.feature.zero_crossing_rate(y=y))), 4)

    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units="time")
    onset_density = round(len(onsets) / duration_sec, 2) if duration_sec > 0 else 0.0
    onset_times = [round(float(t), 3) for t in onsets]

    # Full-song map "marks" — structurally interesting points, described in depth relative to the
    # whole-track numbers just computed above. See _detect_segment_boundaries's docstring for why
    # this doesn't cost another full spectral pass.
    boundary_times = _detect_segment_boundaries(rms, spectral["centroid_frames"], sr, _SPECTRAL_HOP_LENGTH, duration_sec)
    whole_track = {"rms_db": rms_db, "brightness_hz": spectral["brightness_hz"], "onset_density": onset_density}
    segments = _build_segments(
        y, sr, boundary_times, duration_sec, onset_times, spectral["centroid_frames"], _SPECTRAL_HOP_LENGTH, whole_track
    )

    return {
        "duration_sec": duration_sec,
        "bpm": round(bpm, 1),
        "key": spectral["key"],
        "rms_db": rms_db,
        "brightness_hz": spectral["brightness_hz"],
        "rolloff_hz": spectral["rolloff_hz"],
        "zero_crossing_rate": zero_crossing_rate,
        "dynamic_range_db": dynamic_range_db,
        "low_end_ratio": spectral["low_end_ratio"],
        "onset_density": onset_density,
        "onset_times": onset_times,
        "beat_times": beat_times,
        "segments": segments,
        "energy_curve": _energy_curve(rms),
    }


def _probe_duration(file_path: Path) -> float:
    """Cheap duration read — from the file header where possible, no full PCM decode or analysis.

    Used by the upload endpoint, which only needs a duration for its response. Deliberately does
    NOT call `_extract()` — the full feature pipeline (decode + beat-track + onset-detect + STFT/
    chroma/spectral) runs exactly once, later, when `/feedback` is actually requested. Running it
    here too would silently redo the entire analysis a second time for every single upload, which
    on a slow/shared instance CPU is the difference between one ~60-90s pass and two.
    """
    try:
        duration = librosa.get_duration(path=str(file_path))
    except Exception:
        duration = None

    if duration is None:
        # Rare: some containers don't expose duration via header alone. Fall back to a real decode
        # just to validate + measure it — same error handling `_extract`'s own decode uses.
        try:
            y, sr = librosa.load(str(file_path), sr=_TARGET_SR, mono=True)
        except Exception as exc:
            detail = str(exc) or type(exc).__name__
            raise AudioLoadError(f"Could not decode audio file — is it a valid audio file? ({detail})") from exc
        duration = librosa.get_duration(y=y, sr=sr)

    duration = round(float(duration), 2)
    if duration > _MAX_DURATION_SEC:
        raise AudioLoadError(
            f"Audio is too long ({duration / 60:.1f} min) — max supported length is "
            f"{_MAX_DURATION_SEC / 60:.0f} min."
        )
    return duration


async def extract_features(file_path: Path) -> dict:
    # Offloaded to a thread since the rare full-decode fallback in `_probe_duration` is CPU-bound;
    # the common (header-readable) path is fast enough that this is mostly just consistency with
    # `generate_feedback`'s own thread-offload below.
    duration_sec = await anyio.to_thread.run_sync(_probe_duration, file_path)
    return {"duration_sec": duration_sec}


def _describe_features(features: TrackFeatures, duration_sec: float) -> tuple[list[str], list[str]]:
    """Rule-based strengths/improvements — plain Python thresholds, no model call."""
    strengths: list[str] = []
    improvements: list[str] = []

    if -16 <= features.rms_db <= -8:
        strengths.append(f"Sits at a solid, competitive loudness ({features.rms_db} dB RMS).")
    elif features.rms_db < -24:
        improvements.append(f"Quiet overall ({features.rms_db} dB RMS) — consider raising the level.")
    elif features.rms_db > -6:
        improvements.append(f"Very loud/hot ({features.rms_db} dB RMS) — check for clipping/distortion.")

    if features.dynamic_range_db >= 12:
        strengths.append(f"Good dynamic contrast (peak sits {features.dynamic_range_db} dB above the average level).")
    elif features.dynamic_range_db <= 6:
        improvements.append(f"Dynamic range is narrow ({features.dynamic_range_db} dB) — may sound flat/over-compressed.")

    if features.brightness_hz >= 3000:
        strengths.append(f"Bright, present high end (spectral centroid {features.brightness_hz:.0f} Hz).")
    elif features.brightness_hz < 1200:
        improvements.append(f"Sounds dark/muffled (spectral centroid {features.brightness_hz:.0f} Hz) — could use more top end.")

    if features.low_end_ratio >= 0.35:
        strengths.append(f"Strong low-end presence ({features.low_end_ratio * 100:.0f}% of energy below {_LOW_END_CUTOFF_HZ:.0f} Hz).")
    elif features.low_end_ratio < 0.1:
        improvements.append(f"Low end feels thin ({features.low_end_ratio * 100:.0f}% of energy below {_LOW_END_CUTOFF_HZ:.0f} Hz).")

    if features.onset_density >= 3:
        strengths.append(f"Dense rhythmic activity ({features.onset_density}/sec) — feels busy and energetic.")
    elif features.onset_density < 0.8 and duration_sec > 4:
        improvements.append(f"Sparse rhythmic activity ({features.onset_density}/sec) — could use more movement.")

    if not strengths:
        strengths.append("No standout strengths flagged by the numbers — nothing wrong, just nothing extreme either way.")
    if not improvements:
        improvements.append("No red flags in the extracted features.")

    return strengths[:4], improvements[:4]


async def generate_feedback(track_id: str, file_path: Path) -> CoachFeedbackResponse:
    raw = await anyio.to_thread.run_sync(_extract, file_path)
    features = TrackFeatures(
        bpm=raw["bpm"],
        key=raw["key"],
        rms_db=raw["rms_db"],
        brightness_hz=raw["brightness_hz"],
        rolloff_hz=raw["rolloff_hz"],
        zero_crossing_rate=raw["zero_crossing_rate"],
        dynamic_range_db=raw["dynamic_range_db"],
        low_end_ratio=raw["low_end_ratio"],
        onset_density=raw["onset_density"],
        onset_times=raw["onset_times"],
        beat_times=raw["beat_times"],
        energy_curve=raw["energy_curve"],
    )

    strengths, improvements = _describe_features(features, raw["duration_sec"])

    feature_summary = (
        f"BPM: {features.bpm:.1f}\n"
        f"Key estimate: {features.key}\n"
        f"Loudness (RMS): {features.rms_db} dB\n"
        f"Dynamic range: {features.dynamic_range_db} dB\n"
        f"Brightness (spectral centroid): {features.brightness_hz:.0f} Hz\n"
        f"Rolloff: {features.rolloff_hz:.0f} Hz\n"
        f"Low-end energy ratio: {features.low_end_ratio}\n"
        f"Onset density: {features.onset_density}/sec\n"
        f"Duration: {raw['duration_sec']:.1f}s"
    )
    _track_context[track_id] = (
        f"Track features:\n{feature_summary}\n\n"
        f"Feedback already given — strengths: {'; '.join(strengths)}\n"
        f"Feedback already given — improvements: {'; '.join(improvements)}"
    )

    segments = [
        TrackSegment(
            start_sec=seg["start_sec"],
            end_sec=seg["end_sec"],
            mark_sec=seg["mark_sec"],
            features=SegmentFeatures(**seg["features"]),
            notes=seg["notes"],
        )
        for seg in raw["segments"]
    ]

    return CoachFeedbackResponse(
        track_id=track_id,
        features=features,
        strengths=strengths,
        improvements=improvements,
        segments=segments,
    )


async def continue_chat(track_id: str, messages: list[ChatMessage]) -> str:
    context = _track_context.get(track_id)
    if context is None:
        # Not in this process's memory — e.g. the server restarted since feedback was generated.
        # Reconstruct from SQLite before giving up.
        context = await history.get_coach_context(track_id)
        if context is None:
            raise KeyError(track_id)
        _track_context[track_id] = context

    system = _CHAT_SYSTEM_PROMPT_TEMPLATE.format(context=context)
    chat_messages = [{"role": "system", "content": system}]
    chat_messages += [{"role": m.role, "content": m.content} for m in messages]
    return await ollama_client.chat(chat_messages)
