# Build Plan

This is a scaffold-first project. The repo structure, stub endpoints, and stub pages already
exist for all three features so the shape of the system is visible up front — but the actual
logic gets built **one phase at a time**, in order. Don't jump ahead.

## Vision

Lower the barrier for bedroom producers making rage/plugg-adjacent music (Ken Carson, Playboi
Carti, OsamaSon, Draco FM as reference points — dark, distorted, minimal, 808-driven) to get the
kind of feedback and technical analysis they'd otherwise need a mentor, engineer, or expensive
plugin for.

## Guiding principles

- **Accessible first.** No jargon walls. A brand-new producer and a five-year veteran should both
  get useful output.
- **Local-first.** Runs entirely on the user's machine via Ollama — no API key, no cost, no
  account required to try it.
- **Feedback, not judgment.** The AI Coach and Lyric Lab should sound like a knowledgeable peer,
  not a grading rubric. Specific > generic ("the hats are washing out the 808 above 200Hz" beats
  "the mix needs work").

## Phases

### Phase 0 — Scaffolding (current)
- [x] Repo structure (`frontend/`, `backend/`, `docs/`)
- [x] FastAPI app boots with three routers (`/api/coach`, `/api/midi`, `/api/lyrics`), all
      returning `501 Not Implemented` from stubbed service functions
- [x] Next.js app boots with a landing page + one page per feature, wired to call the backend
      (will show "not implemented yet" until each phase lands)
- [x] Ollama client wrapper in `backend/app/services/ollama_client.py` (this is generic plumbing,
      not feature logic, so it's already functional)

### Phase 1 — MIDI Analyzer ✅ complete
Simplest feature: no audio DSP, no conversation state, single request/response.

- [x] Implement `backend/app/services/midi_analysis.py`:
  - Parse `.mid` with `pretty_midi`
  - Extract: BPM/tempo (from the file's tempo meta-event, falling back to onset-based estimation
    only if absent), time signature, key estimate (duration-weighted pitch-class histogram →
    Krumhansl-Schmuckler correlation, drum tracks excluded), note density, pitch range, average
    velocity, instrument/track count
  - Feed extracted features to Ollama (`llama3:8b` by default) for a plain-English "feel"/mood
    read plus 2 suggestions, returned as JSON
- [x] Wire up `backend/app/routers/midi.py` `POST /api/midi/analyze`
- [x] Wire up `frontend/app/midi-analyzer/page.tsx` to actually render the returned analysis
- [x] Verified end to end: service function, live HTTP endpoint via curl, and the built/served
      Next.js page (`npm run build` + `npm run dev`) all confirmed working against a real
      synthetic test MIDI file and the local Ollama instance
- See [docs/FEATURE_MIDI_ANALYZER.md](docs/FEATURE_MIDI_ANALYZER.md)

### Phase 2 — Lyric Lab ✅ complete
Pure text in/out — easiest LLM integration, good place to nail the prompt style/persona before
tackling audio.

- [x] Implemented `backend/app/services/lyrics_lab.py`:
  - **Analyze**: critique flow, rhyme scheme, repetition, cadence, imagery — in the voice of a
    peer producer/writer, referencing the rage/plugg aesthetic where relevant
  - **Generate**: given existing lyrics + a theme/prompt, generate N candidate lines that match
    the established flow/rhyme scheme
  - No non-AI fallback here — critique/generation are inherently LLM tasks, unlike MIDI/Coach
- [x] Wire up `backend/app/routers/lyrics.py` (`/analyze`, `/generate`) — maps `OllamaError`→503,
      unparseable-output→502
- [x] Wire up `frontend/app/lyrics/page.tsx`, including the line-by-line breakdown
- [x] Verified end to end against live Ollama (`llama3:8b`) and a simulated Ollama-down case
- See [docs/FEATURE_LYRICS.md](docs/FEATURE_LYRICS.md)

### Phase 3 — AI Coach ✅ complete
Most complex: file upload, audio feature extraction, structured feedback, then multi-turn chat
grounded in that track's analysis.

- [x] Implemented `backend/app/services/audio_analysis.py`:
  - Load audio with `librosa`/`soundfile`
  - Extract: tempo/BPM, key estimate (chroma + Krumhansl-Schmuckler, same approach as MIDI),
    loudness/RMS, spectral centroid (brightness) — all deterministic, no LLM. Section
    structure/stereo width deferred (not needed for a first pass per the feature spec)
  - Feed features to Ollama for strengths/improvements/follow-up questions, with an
    `ai_available` field on the response mirroring the MIDI Analyzer's optional-AI split
- [x] Implemented chat endpoint: grounds every reply in the track's features + prior feedback
      (in-memory per `track_id`; Phase 4 persists this)
- [x] Wire up `backend/app/routers/coach.py` (`/upload`, `/feedback`, `/chat`) — maps
      `AudioLoadError`→400, unknown `track_id`→404, `OllamaError`→503; 50MB upload cap
- [x] Wire up `frontend/app/coach/page.tsx` (features panel, AI panel gated on `ai_available`,
      chat)
- [x] Verified end to end against live Ollama with a synthetic test beat, plus silence and
      undecodable-file edge cases
- See [docs/FEATURE_COACH.md](docs/FEATURE_COACH.md)

### Phase 4 — Polish
- Visual identity: dark theme, distorted/glitch accents in the UI matching the reference artists'
  aesthetic (currently just a placeholder dark Tailwind theme)
- Persist history (SQLite) — past tracks, past lyric sessions, so users can revisit feedback
- Error handling / loading states / file-size limits polish
- Optional: swap Ollama for a hosted model behind an env flag, once local-first is proven out

## Open questions (revisit before/during relevant phase)

- Key detection accuracy for MIDI vs audio — may need a proper algorithm (Krumhansl-Schmuckler)
  rather than naive pitch histogram.
- How much of the AI Coach's feedback should be rule-based/deterministic (from extracted audio
  features) vs purely LLM-generated? Leaning: extract real features deterministically, let the LLM
  turn features into narrative feedback — reduces hallucination risk.
- File size / duration limits for audio uploads (local Whisper-scale processing is fine, but don't
  want someone uploading a 45-minute stem session).
- Which Ollama model works best for tone (rage/plugg-aware, not corporate-sounding)? Worth testing
  a few (`llama3.1`, `mistral`, `gemma2`) once Phase 2 lands and prompts are testable.
