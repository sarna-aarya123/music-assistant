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

from app.models.schemas import ChatMessage, CoachFeedbackResponse, TrackFeatures
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
        }

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0

    # Compute the magnitude spectrogram once and hand it to every feature function that accepts an
    # `S=` argument, instead of letting each one (chroma_stft, spectral_centroid, spectral_rolloff)
    # silently recompute its own full STFT internally. The FFT pass itself is the single biggest
    # allocation/CPU cost in this function — this cuts it from 4 full passes down to 1.
    stft = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=(stft.shape[0] - 1) * 2)

    # chroma_stft's default S is a *power* spectrogram (magnitude**2); centroid/rolloff default to
    # magnitude (power=1) — squaring here is a cheap elementwise op on an array we already have,
    # far cheaper than re-running librosa.stft a second time.
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, S=stft**2)
    key = _estimate_key(chroma.mean(axis=1))

    rms = librosa.feature.rms(y=y)[0]
    rms_mean = float(np.mean(rms))
    rms_db = round(20 * math.log10(rms_mean), 1) if rms_mean > 0 else -120.0

    peak = float(np.max(np.abs(y)))
    dynamic_range_db = round(20 * math.log10(peak / rms_mean), 1) if rms_mean > 0 and peak > 0 else 0.0

    brightness_hz = round(float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr, S=stft))), 1)
    rolloff_hz = round(float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, S=stft))), 1)
    zero_crossing_rate = round(float(np.mean(librosa.feature.zero_crossing_rate(y=y))), 4)
    low_end_ratio = _low_end_ratio(stft, freqs)

    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    onset_density = round(len(onsets) / duration_sec, 2) if duration_sec > 0 else 0.0

    return {
        "duration_sec": duration_sec,
        "bpm": round(bpm, 1),
        "key": key,
        "rms_db": rms_db,
        "brightness_hz": brightness_hz,
        "rolloff_hz": rolloff_hz,
        "zero_crossing_rate": zero_crossing_rate,
        "dynamic_range_db": dynamic_range_db,
        "low_end_ratio": low_end_ratio,
        "onset_density": onset_density,
    }


async def extract_features(file_path: Path) -> dict:
    # `_extract` is synchronous, CPU-bound librosa work (beat tracking, STFT, chroma, onsets) — run
    # it in a worker thread rather than directly on the event loop. Without this, a single upload's
    # analysis blocks every other coroutine on this process, including Render's own /health probe,
    # for the whole duration of the analysis (several seconds on a slow/shared instance CPU).
    return await anyio.to_thread.run_sync(_extract, file_path)


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

    return CoachFeedbackResponse(
        track_id=track_id,
        features=features,
        strengths=strengths,
        improvements=improvements,
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
