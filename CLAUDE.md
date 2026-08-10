# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

AI Music Assistant — three features for producers in the rage/plugg lane (Ken Carson, Playboi
Carti, OsamaSon, Draco FM as style references): an AI Coach (audio feedback + chat), a MIDI
Analyzer (key/BPM/feel), and a Lyric Lab (critique + generation). Full context:
[README.md](README.md), [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Build order — do not skip ahead

This project is built **one phase at a time**. The full roadmap is in [PLAN.md](PLAN.md):

1. MIDI Analyzer (current phase)
2. Lyric Lab
3. AI Coach
4. Polish (visual identity, persisted history)

Before implementing anything, check PLAN.md for which phase is active and read the matching spec
in `docs/FEATURE_*.md`. Don't build features from a later phase "while you're in there" — flag it
instead of doing it.

## Stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind — `frontend/`
- Backend: FastAPI (Python) — `backend/`
- LLM: local Ollama (no cloud API key). Model/host configured via `backend/.env`
  (`OLLAMA_HOST`, `OLLAMA_MODEL`).
- Audio: librosa/soundfile. MIDI: pretty_midi/mido.

## Where things go

- Routers (`backend/app/routers/*.py`) are thin: validate request, call a service, shape the
  response. All real logic lives in `backend/app/services/*.py`.
- `backend/app/services/ollama_client.py` is the only place that talks to Ollama — route new LLM
  calls through `chat()`/`generate()` there rather than hitting the Ollama HTTP API directly.
- Shared request/response types live in `backend/app/models/schemas.py`; the frontend's mirror of
  these lives in `frontend/lib/api.ts`. Keep both in sync when a shape changes.
- Feature pages are one per route under `frontend/app/<feature>/page.tsx`, using the fetch
  wrappers in `lib/api.ts` — don't call `fetch()` directly from a page component.

## Running things

```bash
# backend
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload
# frontend
cd frontend && npm run dev
```

Ollama must be running locally (`ollama serve`) with a model pulled for any LLM-backed endpoint to
work — endpoints that don't need it yet (unimplemented phases) return `501`.

## Conventions

- Deterministic feature extraction (tempo, key, etc.) stays separate from the LLM's narrative
  output in response schemas — the LLM interprets features, it doesn't invent them. Don't let an
  LLM call be the only source of a numeric fact (BPM, key, duration) that a library can compute.
- **Ollama is optional wherever a feature has real non-AI value.** The MIDI Analyzer's stats
  (BPM/key/density/etc.) work with Python packages alone; the Ollama call is a bonus layer on top
  and fails gracefully (`ai_available: false` in the response, not an error) if Ollama isn't
  installed/running. When building Phase 3 (AI Coach), apply the same split: audio feature
  extraction (librosa) should work standalone, only the narrative feedback/chat needs Ollama. Pure
  text-generation features (Lyric Lab's critique/generation) have no non-AI equivalent, so this
  doesn't apply to them — Ollama is required there by nature of what the feature does.
- No auth, no database yet — local filesystem uploads (`backend/uploads/`, gitignored) and
  in-memory state only, until Phase 4.
- Keep the assistant's tone (both Coach feedback and Lyric Lab critique) like a knowledgeable
  peer, not a grading rubric — specific and concrete over generic praise/criticism.
