"""Lyric critique + generation.

Phase 2 — see PLAN.md and docs/FEATURE_LYRICS.md for the full spec.

Unlike the MIDI Analyzer, there's no non-AI equivalent here — critique and generation are both
inherently LLM tasks, so Ollama is required (not optional) for this feature. Callers should let
`ollama_client.OllamaError` and `LyricsLLMError` propagate to the router, which maps them to
503/502 respectively.
"""

import json

from app.models.schemas import LineNote, LyricsAnalyzeResponse
from app.services import ollama_client

_PERSONA = (
    "You are an experienced music producer/writer friend who works in the rage/plugg/trap lane "
    "(reference points: Ken Carson, Playboi Carti, OsamaSon, Draco FM). "
)

_ANALYZE_SYSTEM_PROMPT = (
    _PERSONA
    + "A writer just handed you their lyrics for notes. Critique rhyme scheme (end rhymes and "
    "internal rhymes, flag where an expected rhyme is missing or weak), repetition (distinguish "
    "intentional hook repetition, which is fine, from unintentional word reuse, which is worth "
    "flagging), cadence/flow (syllable count and consistency across bars — big swings can be "
    "intentional or accidental, note it rather than just calling it wrong), and imagery/"
    "specificity (push back on generic lines, encourage vivid/specific ones). Sound like a peer "
    "giving real notes, not a teacher grading a paper — be direct and concrete, and never give "
    "vague praise like 'this is fire' without a reason attached. "
    "Respond with ONLY valid JSON (no markdown code fences, no extra commentary) in exactly this "
    'shape: {"overall_notes": "2-4 sentences", "rhyme_notes": "string", '
    '"repetition_notes": "string", "cadence_notes": "string", '
    '"line_by_line": [{"line": "the exact original line text", "note": "short specific note"}]}. '
    "Include one line_by_line entry per non-blank input line, in order, using the exact original "
    "line text."
)

_GENERATE_SYSTEM_PROMPT = (
    _PERSONA
    + "A writer wants a few candidate lines to continue what they've already written. Match the "
    "existing rhyme scheme and approximate syllable/cadence pattern of the surrounding lyrics. "
    "Respect any style reference given, but never claim the lines are from or sound like a "
    "specific real artist's unreleased material — style/flow inspiration is fine, impersonation "
    "claims are not. Give the writer options to pick from and edit, don't hand over a finished "
    "song. "
    "Respond with ONLY valid JSON (no markdown code fences, no extra commentary) in exactly this "
    'shape: {"candidates": ["line one", "line two", ...]}.'
)


class LyricsLLMError(RuntimeError):
    """Raised when Ollama is reachable but returns output we can't parse into the expected shape."""


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


def _format_lyrics_block(lyrics: str, style_reference: str | None) -> str:
    block = f"Lyrics:\n{lyrics}"
    if style_reference:
        block += f"\n\nStyle reference: {style_reference}"
    return block


async def analyze_lyrics(lyrics: str, style_reference: str | None) -> LyricsAnalyzeResponse:
    prompt = _format_lyrics_block(lyrics, style_reference)
    raw = await ollama_client.generate(prompt, system=_ANALYZE_SYSTEM_PROMPT)

    try:
        data = json.loads(_strip_code_fences(raw))
        return LyricsAnalyzeResponse(
            overall_notes=str(data.get("overall_notes", "")).strip(),
            rhyme_notes=str(data.get("rhyme_notes", "")).strip(),
            repetition_notes=str(data.get("repetition_notes", "")).strip(),
            cadence_notes=str(data.get("cadence_notes", "")).strip(),
            line_by_line=[
                LineNote(line=str(item.get("line", "")).strip(), note=str(item.get("note", "")).strip())
                for item in data.get("line_by_line", [])
            ],
        )
    except (json.JSONDecodeError, AttributeError) as exc:
        raise LyricsLLMError(f"Ollama returned unparseable output for lyric analysis: {exc}") from exc


async def generate_lines(
    lyrics: str, theme_or_prompt: str, style_reference: str | None, count: int
) -> list[str]:
    prompt = (
        _format_lyrics_block(lyrics, style_reference)
        + f"\n\nGenerate {count} candidate lines continuing/matching this, about: {theme_or_prompt}"
    )
    raw = await ollama_client.generate(prompt, system=_GENERATE_SYSTEM_PROMPT)

    try:
        data = json.loads(_strip_code_fences(raw))
        return [str(line).strip() for line in data.get("candidates", [])][:count]
    except (json.JSONDecodeError, AttributeError) as exc:
        raise LyricsLLMError(f"Ollama returned unparseable output for lyric generation: {exc}") from exc
