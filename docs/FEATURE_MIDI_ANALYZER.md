# Feature: MIDI Analyzer (Phase 1)

## What it does

User uploads a `.mid` file. The system extracts objective musical features using Python packages
alone (`pretty_midi`) — no AI required for this part. If Ollama happens to be running locally, an
optional second step asks it to translate those features into a plain-English "feel"/mood
description a producer would actually say out loud. If Ollama isn't installed/running, the
deterministic stats are still returned in full — the response just has `ai_available: false` and
empty `feel_summary`/`notes`/`suggestions`.

This is deliberate: the tool should be useful to anyone the moment they clone it, with zero setup
beyond Python deps. Ollama is an enhancement, not a requirement, for this feature.

## Input

- A single `.mid` / `.midi` file (multipart upload)

## Extracted features (deterministic — no LLM)

| Feature          | How                                                                 |
|------------------|----------------------------------------------------------------------|
| Tempo / BPM       | `pretty_midi.PrettyMIDI.estimate_tempo()`                           |
| Time signature    | From MIDI time signature events (default 4/4 if absent)             |
| Key estimate      | Pitch-class histogram across all notes → correlate against major/minor key profiles (Krumhansl-Schmuckler) |
| Note density      | Notes per second/bar                                                |
| Pitch range       | Min/max MIDI pitch, in note names                                   |
| Average velocity  | Proxy for dynamics/intensity                                        |
| Track/instrument count | From MIDI program changes / track names                        |
| Chord guess (stretch) | Group simultaneous notes into chords, label root+quality where possible |

## LLM step

Prompt template (see `backend/app/services/midi_analysis.py` once implemented) feeds the extracted
feature table to Ollama and asks for:
1. A one-line mood/feel summary (e.g. "dark, sparse, minor-key — moody plugg territory")
2. 2-3 sentences of context (what the numbers suggest about energy/space in a mix)
3. Optional: 1-2 suggestions (e.g. "low note density could use a counter-melody or arp")

Keep the deterministic features and the LLM's narrative response as **separate fields** in the
response — the UI shows the hard numbers *and* the plain-English read, so the LLM isn't the only
source of truth.

## Output shape (see `MidiAnalysisResponse` in `backend/app/models/schemas.py`)

```json
{
  "bpm": 142.0,
  "time_signature": "4/4",
  "key": "F# minor",
  "note_density": 3.2,
  "pitch_range": ["A2", "C6"],
  "avg_velocity": 88,
  "track_count": 4,
  "feel_summary": "Dark, sparse, minor-key — moody plugg territory.",
  "notes": "Long summary paragraph from the LLM...",
  "suggestions": ["Low note density in the lead — a counter-melody could fill space."]
}
```

## Edge cases to handle when implementing

- Empty/corrupt MIDI file
- MIDI with no tempo/time-signature events (use sensible defaults)
- Multi-track files with drums-only or single-note-per-track content (percussion-only tracks skew
  key detection — exclude channel 10/drum tracks from key estimation)
- Very short files (a few notes) — key estimate confidence should be reflected, not asserted
  confidently
