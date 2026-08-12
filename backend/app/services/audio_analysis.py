"""Audio feature extraction + feedback generation for the AI Coach.

Phase 3 — see PLAN.md and docs/FEATURE_COACH.md for the full spec.

Deterministic features (tempo, key, loudness, brightness) are extracted with librosa alone and
never touch the LLM — only the strengths/improvements/follow-up narrative and chat come from
Ollama, grounded in those features via the prompt. Mirrors the MIDI Analyzer's Ollama-optional
split (`ai_available` on the response); unlike Lyric Lab, feature extraction always works
standalone.
"""

import json
import math
from pathlib import Path

import librosa
import numpy as np

from app.models.schemas import ChatMessage, CoachFeedbackResponse, TrackFeatures
from app.services import history, ollama_client

# Krumhansl-Kessler key profiles — same approach as the MIDI Analyzer, applied to a chroma
# spectrogram instead of a MIDI pitch-class histogram.
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_FEEDBACK_SYSTEM_PROMPT = (
    "You are an experienced music producer friend who specializes in rage/plugg/trap production "
    "(reference points: Ken Carson, Playboi Carti, OsamaSon, Draco FM). A producer just handed "
    "you a table of objective audio features extracted from a beat/loop they're working on. Give "
    "them structured feedback grounded in those specific numbers where possible (e.g. 'the low "
    "end sits well below 100Hz without competing with the kick' rather than generic praise). "
    "Sound like a peer giving real notes, not a textbook. Keep every individual string under 25 "
    "words — put each distinct point in its own array entry rather than combining points into one "
    "long string. "
    "Respond with ONLY valid JSON (no markdown code fences, no extra commentary) in exactly this "
    'shape: {"strengths": ["short point 1", "short point 2"], '
    '"improvements": ["short point 1", "short point 2", "short point 3"], '
    '"follow_up_questions": ["short question 1", "short question 2"]}. '
    "Double-check the JSON is complete and properly closed before responding."
)

_CHAT_SYSTEM_PROMPT_TEMPLATE = (
    "You are an experienced music producer friend (reference points: Ken Carson, Playboi Carti, "
    "OsamaSon, Draco FM) continuing a conversation about a specific track. Stay grounded in the "
    "extracted features and the feedback you already gave below — don't contradict them, and if "
    "the producer asks something the features can't answer (e.g. 'does this sound like "
    "[artist]?'), say so rather than guessing.\n\n{context}"
)

# In-memory grounding context for chat, keyed by track_id — the extracted features plus whatever
# feedback was already given, so every chat turn stays grounded instead of going generic.
# Phase 4 ("Polish" in PLAN.md) persists this; in-memory is fine for Phase 3.
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


def _extract(file_path: Path) -> dict:
    """Deterministic feature extraction with librosa alone — no LLM involved."""
    try:
        y, sr = librosa.load(str(file_path), sr=None, mono=True)
    except Exception as exc:  # librosa/soundfile/audioread raise several distinct error types,
        # several of which (e.g. NoBackendError) have an empty str() — always name the exception
        # type so the message is actually useful.
        detail = str(exc) or type(exc).__name__
        raise AudioLoadError(f"Could not decode audio file — is it a valid audio file? ({detail})") from exc

    duration_sec = round(float(librosa.get_duration(y=y, sr=sr)), 2)

    # Silence/near-silent or empty clips: tempo/key/spectral features are meaningless on zero
    # signal, so short-circuit rather than let librosa produce noisy nonsense.
    if len(y) == 0 or not np.any(y):
        return {"duration_sec": duration_sec, "bpm": 0.0, "key": "Unknown", "rms_db": -120.0, "brightness_hz": 0.0}

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0

    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    key = _estimate_key(chroma.mean(axis=1))

    rms_mean = float(np.mean(librosa.feature.rms(y=y)))
    rms_db = round(20 * math.log10(rms_mean), 1) if rms_mean > 0 else -120.0

    brightness_hz = round(float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))), 1)

    return {
        "duration_sec": duration_sec,
        "bpm": round(bpm, 1),
        "key": key,
        "rms_db": rms_db,
        "brightness_hz": brightness_hz,
    }


async def extract_features(file_path: Path) -> dict:
    return _extract(file_path)


async def _interpret_features(feature_summary: str) -> tuple[bool, list[str], list[str], list[str]]:
    """Ask Ollama for strengths/improvements/follow-ups on top of the deterministic features.

    Pure enhancement — feature extraction works fully without it. If Ollama isn't reachable, the
    caller falls back to empty lists with `ai_available=False`, same pattern as the MIDI Analyzer.
    """
    try:
        raw = await ollama_client.generate(
            feature_summary, system=_FEEDBACK_SYSTEM_PROMPT, temperature=0.3
        )
    except ollama_client.OllamaError:
        return False, [], [], []

    try:
        data = ollama_client.parse_json_response(raw)
        return (
            True,
            [str(s).strip() for s in data.get("strengths", [])],
            [str(s).strip() for s in data.get("improvements", [])],
            [str(s).strip() for s in data.get("follow_up_questions", [])],
        )
    except (json.JSONDecodeError, AttributeError):
        return True, [], [], []


async def generate_feedback(track_id: str, file_path: Path) -> CoachFeedbackResponse:
    raw = _extract(file_path)
    features = TrackFeatures(
        bpm=raw["bpm"], key=raw["key"], rms_db=raw["rms_db"], brightness_hz=raw["brightness_hz"]
    )
    feature_summary = (
        f"BPM: {features.bpm:.1f}\n"
        f"Key estimate: {features.key}\n"
        f"Loudness (RMS): {features.rms_db} dB\n"
        f"Brightness (spectral centroid): {features.brightness_hz:.0f} Hz\n"
        f"Duration: {raw['duration_sec']:.1f}s"
    )

    ai_available, strengths, improvements, follow_up_questions = await _interpret_features(feature_summary)

    _track_context[track_id] = (
        f"Track features:\n{feature_summary}\n\n"
        f"Feedback already given — strengths: {'; '.join(strengths) or '(none yet)'}\n"
        f"Feedback already given — improvements: {'; '.join(improvements) or '(none yet)'}"
    )

    return CoachFeedbackResponse(
        track_id=track_id,
        features=features,
        ai_available=ai_available,
        strengths=strengths,
        improvements=improvements,
        follow_up_questions=follow_up_questions,
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
