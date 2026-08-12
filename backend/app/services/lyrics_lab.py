"""Lyric critique, entirely in pure Python — rhyme scheme, repetition, and cadence analysis.

No model call anywhere in this module. Rhyme detection uses the CMU Pronouncing Dictionary (via
the `pronouncing`/`cmudict` packages) for real phonetic matching, falling back to a grapheme-based
heuristic for slang/made-up words that aren't in the dictionary. Syllable counts use the same
dict-first-then-heuristic approach.

`generate_lines()` (line generation) is kept below, unused by any router, for a future AI pass —
see `app/services/ollama_client.py` for the same "kept but disconnected" treatment of the
underlying Ollama client. Line generation has no non-AI equivalent worth building, unlike critique.
"""

import re
from collections import Counter

import pronouncing

from app.models.schemas import LineNote, LyricsAnalyzeResponse
from app.services import ollama_client

_WORD_RE = re.compile(r"[A-Za-z']+")
_VOWEL_GROUP_RE = re.compile(r"[aeiouy]+")

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "it", "is", "im", "i'm",
    "i", "you", "your", "my", "me", "we", "us", "he", "she", "they", "them", "that", "this",
    "for", "with", "so", "be", "was", "are", "do", "not", "no", "up", "on", "just", "like",
}

_HOOK_MIN_REPEATS = 2  # a line repeated this many times or more is treated as an intentional hook
_OVERUSE_MIN_COUNT = 4  # a non-stopword used at least this many times gets flagged


# ---------------------------------------------------------------------------
# Phonetics helpers (CMU dict via `pronouncing`, with a heuristic fallback for OOV words)
# ---------------------------------------------------------------------------


def _clean_word(word: str) -> str:
    return re.sub(r"[^a-z']", "", word.lower()).strip("'")


def _heuristic_syllables(word: str) -> int:
    """Vowel-group count with a silent-trailing-e correction — standard cheap syllable heuristic."""
    w = _clean_word(word)
    if not w:
        return 0
    groups = _VOWEL_GROUP_RE.findall(w)
    count = len(groups)
    if w.endswith("e") and not w.endswith("le") and count > 1:
        count -= 1
    return max(count, 1)


def _heuristic_rhyme_key(word: str) -> str:
    """Grapheme-based fallback rhyme key: from the start of the last vowel group to the end."""
    w = _clean_word(word)
    if not w:
        return ""
    groups = list(_VOWEL_GROUP_RE.finditer(w))
    key = w[groups[-1].start():] if groups else w[-2:]
    # "-y" word-endings are usually pronounced like "-ee" (party, carti, happy) — normalize so
    # heuristic-only words still line up with real "-ee"/"-i" endings from the CMU dict.
    if key.endswith("y"):
        key = key[:-1] + "i"
    return key


def syllable_count(word: str) -> int:
    phones = pronouncing.phones_for_word(_clean_word(word))
    if phones:
        return pronouncing.syllable_count(phones[0])
    return _heuristic_syllables(word)


def rhyme_key(word: str) -> str:
    phones = pronouncing.phones_for_word(_clean_word(word))
    if phones:
        return pronouncing.rhyming_part(phones[0])
    return _heuristic_rhyme_key(word)


# ---------------------------------------------------------------------------
# Line-level analysis
# ---------------------------------------------------------------------------


class LyricsLLMError(RuntimeError):
    """Kept for the (currently disconnected) AI generation path — see `generate_lines()` below."""


def _last_word(line: str) -> str | None:
    words = _WORD_RE.findall(line)
    return words[-1] if words else None


def _rhyme_scheme(end_keys: list[str | None]) -> list[str]:
    """Assign a rhyme-scheme letter (A, B, C, ...) per line by matching rhyme keys, in first-seen order."""
    labels: dict[str, str] = {}
    scheme: list[str] = []
    next_label = "A"
    for key in end_keys:
        if not key:
            scheme.append("-")
            continue
        if key not in labels:
            labels[key] = next_label
            next_label = chr(ord(next_label) + 1) if next_label != "Z" else "A2"
        scheme.append(labels[key])
    return scheme


def analyze_lyrics(lyrics: str) -> LyricsAnalyzeResponse:
    raw_lines = [line for line in lyrics.splitlines() if line.strip()]
    if not raw_lines:
        return LyricsAnalyzeResponse(
            overall_notes="No lyrics to analyze — paste some lines first.",
            rhyme_notes="",
            repetition_notes="",
            cadence_notes="",
            line_by_line=[],
        )

    words_per_line = [_WORD_RE.findall(line) for line in raw_lines]
    end_words = [_last_word(line) for line in raw_lines]
    end_keys = [rhyme_key(w) if w else None for w in end_words]
    scheme = _rhyme_scheme(end_keys)
    syllables_per_line = [sum(syllable_count(w) for w in words) for words in words_per_line]

    # --- Rhyme ---------------------------------------------------------
    rhymes_with_next = [
        bool(end_keys[i]) and end_keys[i] == end_keys[i + 1] for i in range(len(raw_lines) - 1)
    ]
    rhymes_with_prev_2 = [
        i >= 2 and bool(end_keys[i]) and end_keys[i] == end_keys[i - 2] for i in range(len(raw_lines))
    ]
    couplet_rate = sum(rhymes_with_next) / len(rhymes_with_next) if rhymes_with_next else 0
    alternating_rate = sum(rhymes_with_prev_2) / len(raw_lines) if raw_lines else 0

    if couplet_rate >= 0.5 and couplet_rate >= alternating_rate:
        pattern = "mostly couplets (AABB-style, consecutive lines rhyming)"
        broken = [i for i in range(len(rhymes_with_next)) if not rhymes_with_next[i]]
    elif alternating_rate >= 0.4:
        pattern = "mostly alternating (ABAB-style, every other line rhyming)"
        broken = [i for i in range(2, len(raw_lines)) if not rhymes_with_prev_2[i]]
    else:
        pattern = "no consistent end-rhyme pattern"
        broken = []

    rhyme_scheme_str = "".join(scheme)
    rhyme_notes = f"End-rhyme scheme: {rhyme_scheme_str}. Detected pattern: {pattern}."
    if pattern != "no consistent end-rhyme pattern" and broken:
        broken_lines = ", ".join(str(i + 1) for i in broken[:5])
        rhyme_notes += f" Line(s) {broken_lines} break the established pattern — weak or missing rhyme."
    if not any(end_keys):
        rhyme_notes = "Couldn't detect any end rhymes — lines may be too short or missing words."

    # --- Repetition ------------------------------------------------------
    normalized_lines = [line.strip().lower() for line in raw_lines]
    line_counts = Counter(normalized_lines)
    hook_lines = {line for line, count in line_counts.items() if count >= _HOOK_MIN_REPEATS}

    non_hook_words: list[str] = []
    for line, words in zip(normalized_lines, words_per_line):
        if line in hook_lines:
            continue
        non_hook_words.extend(w.lower() for w in words if w.lower() not in _STOPWORDS and len(w) > 2)
    word_counts = Counter(non_hook_words)
    overused = [(w, c) for w, c in word_counts.most_common() if c >= _OVERUSE_MIN_COUNT]

    repetition_parts = []
    if hook_lines:
        repetition_parts.append(
            f"{len(hook_lines)} line(s) repeat verbatim (likely an intentional hook) — that's fine."
        )
    if overused:
        overused_str = ", ".join(f'"{w}" ({c}x)' for w, c in overused[:5])
        repetition_parts.append(f"Words repeated a lot outside the hook: {overused_str}.")
    else:
        repetition_parts.append("No excessive word reuse outside any repeated hook lines.")
    repetition_notes = " ".join(repetition_parts)

    # --- Cadence -----------------------------------------------------
    mean_syllables = sum(syllables_per_line) / len(syllables_per_line)
    variance = sum((s - mean_syllables) ** 2 for s in syllables_per_line) / len(syllables_per_line)
    stdev = variance**0.5
    threshold = max(2.0, stdev * 1.3)
    outlier_lines = [
        i for i, s in enumerate(syllables_per_line) if abs(s - mean_syllables) > threshold
    ]

    cadence_notes = f"Average {mean_syllables:.1f} syllables/line (range {min(syllables_per_line)}-{max(syllables_per_line)})."
    if outlier_lines:
        outlier_str = ", ".join(str(i + 1) for i in outlier_lines[:5])
        cadence_notes += f" Line(s) {outlier_str} break the established rhythm — noticeably shorter or longer than the rest."
    else:
        cadence_notes += " Syllable counts are consistent line to line."

    # --- Per-line notes ------------------------------------------------
    line_by_line = []
    for i, line in enumerate(raw_lines):
        parts = [f"{syllables_per_line[i]} syllables"]
        if scheme[i] != "-":
            parts.append(f"rhyme {scheme[i]}")
        if i in outlier_lines:
            parts.append("cadence outlier")
        if normalized_lines[i] in hook_lines:
            parts.append("repeated hook line")
        line_words = {w.lower() for w in words_per_line[i]}
        overused_here = [w for w, _ in overused if w in line_words]
        if overused_here:
            parts.append(f"reuses \"{overused_here[0]}\"")
        line_by_line.append(LineNote(line=line, note=" · ".join(parts)))

    overall_notes = (
        f"{len(raw_lines)} lines, {mean_syllables:.1f} syllables/line on average, "
        f"rhyme scheme {rhyme_scheme_str} ({pattern})."
    )

    return LyricsAnalyzeResponse(
        overall_notes=overall_notes,
        rhyme_notes=rhyme_notes,
        repetition_notes=repetition_notes,
        cadence_notes=cadence_notes,
        line_by_line=line_by_line,
    )


# ---------------------------------------------------------------------------
# Line generation — AI-only, disconnected (see module docstring)
# ---------------------------------------------------------------------------

_PERSONA = "You are an experienced music producer/writer friend helping with lyrics. "

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


def _format_lyrics_block(lyrics: str, style_reference: str | None) -> str:
    block = f"Lyrics:\n{lyrics}"
    if style_reference:
        block += f"\n\nStyle reference: {style_reference}"
    return block


async def generate_lines(
    lyrics: str, theme_or_prompt: str, style_reference: str | None, count: int
) -> list[str]:
    import json

    prompt = (
        _format_lyrics_block(lyrics, style_reference)
        + f"\n\nGenerate {count} candidate lines continuing/matching this, about: {theme_or_prompt}"
    )
    raw = await ollama_client.generate(prompt, system=_GENERATE_SYSTEM_PROMPT)

    try:
        data = ollama_client.parse_json_response(raw)
        return [str(line).strip() for line in data.get("candidates", [])][:count]
    except (json.JSONDecodeError, AttributeError) as exc:
        raise LyricsLLMError(f"Ollama returned unparseable output for lyric generation: {exc}") from exc
