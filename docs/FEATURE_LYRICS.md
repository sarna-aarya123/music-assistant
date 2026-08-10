# Feature: Lyric Lab (Phase 2)

## What it does

Two modes on the same text input:
1. **Analyze** — critique existing lyrics (flow, rhyme, repetition, cadence, imagery)
2. **Generate** — produce a handful of candidate lines that match the flow/style/theme of what's
   already written

## Input

- `lyrics`: raw text (line breaks preserved — treat each line as a bar/phrase)
- `style_reference` (optional, free text): e.g. "Ken Carson, aggressive, short punchy bars" — lets
  the user steer tone without the system hardcoding specific artists' names into every prompt
- For generate mode: `theme_or_prompt` (what the new lines should be about/continue), `count`
  (how many candidate lines/bars to generate, default ~4)

## Analyze mode — what to critique

- **Rhyme scheme**: identify end rhymes and internal rhymes, flag where a expected rhyme is
  missing/weak
- **Repetition**: repeated words/phrases — flag both "intentional hook repetition" (fine) vs
  "unintentional word reuse" (worth flagging)
- **Cadence/flow**: syllable count per line, consistency across bars (big swings can be
  intentional or accidental — note it, don't just call it wrong)
- **Imagery/specificity**: generic lines ("I'm the best, you know it") vs specific/vivid ones —
  encourage specificity
- Tone should read like a peer giving notes, not a teacher grading a paper. Be direct and
  concrete; avoid vague praise ("this is fire") without a reason attached.

## Generate mode — constraints

- Match the existing rhyme scheme and approximate syllable/cadence pattern of the surrounding
  lyrics
- Respect `style_reference` if provided
- Return multiple candidates (not just one) so the user picks/edits rather than accepting
  verbatim — this tool assists, it doesn't ghostwrite the whole song
- Never claim the generated lines are from/like a specific real artist's unreleased material —
  style/flow inspiration is fine, impersonation claims are not

## Output shapes (see `backend/app/models/schemas.py`)

**Analyze**
```json
{
  "overall_notes": "string, 2-4 sentences",
  "rhyme_notes": "string",
  "repetition_notes": "string",
  "cadence_notes": "string",
  "line_by_line": [
    {"line": "...", "note": "..."}
  ]
}
```

**Generate**
```json
{
  "candidates": ["line one...", "line two...", "line three..."]
}
```

## Prompting notes

- Feed the full lyrics block as context every time (not just the last line) so rhyme
  scheme/cadence continuity is respected.
- Keep the persona consistent with the Coach feature's tone — both should sound like the same
  "assistant," just applied to different material. Consider sharing a system-prompt fragment
  between `lyrics` and `coach` prompt templates once both exist.
