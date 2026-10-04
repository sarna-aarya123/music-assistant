"""Hybrid layer: Python measures, a local LLM (Ollama) interprets.

Design rule — the model never produces a number. Every figure it may mention is computed by the
librosa pipeline in `audio_analysis.py`, handed to the model as a fixed fact sheet, and the reply is
then checked in Python: any number in the text that isn't in the fact sheet is reported back as
`unverified_claims` so a hallucinated figure is flagged instead of silently shown.

Ollama only runs on the user's own machine, so on the deployed backend every function here degrades
to `OllamaError` and the router reports AI as unavailable — the deterministic analysis is unaffected.
"""

import re

from app.core.config import settings
from app.models.schemas import ChatMessage, CoachFeedbackResponse, TrackSegment
from app.services import ollama_client

_SYSTEM_PROMPT = (
    "You are a producer friend giving a quick, specific read on one section of a beat. "
    "Use ONLY the measured facts provided. Never invent numbers, keys, instruments, or genres, and "
    "never quote a number that isn't in the facts. If the facts can't answer something, say so. "
    "When comparing a section to the track, reuse the comparison wording given in the facts exactly "
    "(higher/lower/about the same) — do not work out directions yourself. "
    "Plain language, no headings, no bullet lists."
)

_INSIGHT_TASK = (
    "Write 3 short sentences: what this section is doing compared to the rest of the track, one "
    "thing that is working, and one concrete thing to try. Reference the measurements."
)


def _fmt_time(sec: float) -> str:
    return f"{int(sec // 60)}:{int(round(sec % 60)):02d}"


def _vs_track(delta: float, unit: str, tolerance: float) -> str:
    """Pre-computed comparison wording — small models flip "louder"/"quieter" on negative dB, so
    Python states the direction and the model only has to repeat it."""
    if abs(delta) <= tolerance:
        return "about the same as the track average"
    return f"{abs(delta):.1f} {unit} {'higher' if delta > 0 else 'lower'} than the track average"


def _segment_facts(seg: TrackSegment, index: int, total: int, track) -> str:
    loud = _vs_track(seg.features.rms_db - track.rms_db, "dB", 0.5)
    bright = _vs_track(seg.features.brightness_hz - track.brightness_hz, "Hz", 100)
    dens = _vs_track(seg.features.onset_density - track.onset_density, "per second", 0.3)
    return (
        f"Section {index + 1} of {total}, {_fmt_time(seg.start_sec)} to {_fmt_time(seg.end_sec)}\n"
        f"- Loudness: {seg.features.rms_db} dB ({loud}; a higher dB value means louder)\n"
        f"- Brightness: {round(seg.features.brightness_hz)} Hz ({bright})\n"
        f"- Onset density: {seg.features.onset_density} per second ({dens})\n"
        f"- Zero-crossing rate: {seg.features.zero_crossing_rate}\n"
        f"- Automatic notes: {' | '.join(seg.notes)}\n"
        "Not measured for this section: low-end amount, key, chords, melody."
    )


def _track_facts(fb: CoachFeedbackResponse) -> str:
    f = fb.features
    return (
        f"Whole track: {f.bpm:.0f} BPM, key {f.key}, loudness {f.rms_db} dB, "
        f"brightness {round(f.brightness_hz)} Hz, dynamic range {f.dynamic_range_db} dB, "
        f"low-end ratio {round(f.low_end_ratio * 100)}%, onset density {f.onset_density} per second"
    )


def build_facts(fb: CoachFeedbackResponse, segment_index: int | None) -> str:
    parts = [_track_facts(fb)]
    if segment_index is not None:
        seg = fb.segments[segment_index]
        parts.append(_segment_facts(seg, segment_index, len(fb.segments), fb.features))
    return "\n\n".join(parts)


_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


def find_unverified_numbers(reply: str, facts: str) -> list[str]:
    """Numbers in `reply` with no counterpart in `facts` (within rounding). Single digits 1-4 are
    ignored — "3 sentences", "section 2", "a 2x" and the like aren't measurements."""
    allowed = [float(n) for n in _NUMBER_RE.findall(facts)]
    flagged: list[str] = []
    for token in _NUMBER_RE.findall(reply):
        value = float(token)
        if value <= 4 and "." not in token:
            continue
        if any(abs(value - a) <= max(0.51, abs(a) * 0.01) for a in allowed):
            continue
        if token not in flagged:
            flagged.append(token)
    return flagged


_KEY_RE = re.compile(r"\b[A-G][#b]?\s+(?:major|minor)\b", re.IGNORECASE)


def find_unverified_claims(reply: str, facts: str) -> list[str]:
    """Numbers plus any key the audio pipeline never reported (e.g. "E minor" when the track is E
    major). Section-level key detection was deliberately removed as unreliable, so a reply asserting
    a section key is unsupported."""
    flagged = find_unverified_numbers(reply, facts)
    facts_lower = facts.lower()
    for match in _KEY_RE.findall(reply):
        if match.lower() not in facts_lower and match not in flagged:
            flagged.append(match)
    return flagged


async def section_insight(fb: CoachFeedbackResponse, segment_index: int) -> tuple[str, list[str]]:
    facts = build_facts(fb, segment_index)
    reply = await ollama_client.generate(
        f"Measured facts:\n{facts}\n\n{_INSIGHT_TASK}",
        system=_SYSTEM_PROMPT,
        temperature=0.3,
    )
    reply = reply.strip()
    return reply, find_unverified_claims(reply, facts)


async def chat(
    fb: CoachFeedbackResponse, messages: list[ChatMessage], segment_index: int | None
) -> tuple[str, list[str]]:
    facts = build_facts(fb, segment_index)
    convo = [{"role": "system", "content": f"{_SYSTEM_PROMPT}\n\nMeasured facts:\n{facts}"}]
    convo += [{"role": m.role, "content": m.content} for m in messages]
    reply = (await ollama_client.chat(convo, temperature=0.4)).strip()
    return reply, find_unverified_claims(reply, facts)


def model_name() -> str:
    return settings.ollama_model
