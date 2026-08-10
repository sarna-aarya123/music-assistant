"""Lyric critique + generation.

Phase 2 — see PLAN.md and docs/FEATURE_LYRICS.md for the full spec before implementing.

Planned approach:
  - `analyze_lyrics`: prompt Ollama to critique rhyme scheme, repetition, cadence, and imagery,
    returning both overall notes and a per-line breakdown.
  - `generate_lines`: prompt Ollama to produce N candidate lines matching the existing lyrics'
    flow/rhyme scheme and any given theme/style reference.
"""

from app.models.schemas import LyricsAnalyzeResponse


async def analyze_lyrics(lyrics: str, style_reference: str | None) -> LyricsAnalyzeResponse:
    raise NotImplementedError(
        "Lyrics analysis is not implemented yet — this is Phase 2. See PLAN.md and "
        "docs/FEATURE_LYRICS.md."
    )


async def generate_lines(
    lyrics: str, theme_or_prompt: str, style_reference: str | None, count: int
) -> list[str]:
    raise NotImplementedError(
        "Lyrics generation is not implemented yet — this is Phase 2. See PLAN.md and "
        "docs/FEATURE_LYRICS.md."
    )
