# Architecture

## Overview

```
┌─────────────────────┐        HTTP/JSON        ┌──────────────────────┐        HTTP        ┌────────────┐
│   Next.js frontend   │  ───────────────────▶   │   FastAPI backend    │  ────────────────▶ │   Ollama   │
│  (localhost:3000)    │  ◀───────────────────   │   (localhost:8000)   │  ◀──────────────── │ (local LLM)│
└─────────────────────┘                          └──────────┬───────────┘                    └────────────┘
                                                              │
                                                              ▼
                                                  ┌───────────────────────┐
                                                  │ librosa / pretty_midi │
                                                  │  (audio + MIDI DSP)   │
                                                  └───────────────────────┘
```

The frontend never talks to Ollama or the DSP libraries directly — it only talks to the FastAPI
backend over a small JSON REST API. This keeps all "expensive"/native work (audio parsing, model
calls) server-side, and means the frontend stays a thin UI layer.

## Backend structure

```
backend/
├── app/
│   ├── main.py              FastAPI app, CORS, router registration
│   ├── core/
│   │   └── config.py        Settings (env vars): Ollama host/model, upload dir, CORS origins
│   ├── models/
│   │   └── schemas.py       Pydantic request/response models, shared across routers
│   ├── routers/
│   │   ├── coach.py         /api/coach/*   (upload, feedback, chat)
│   │   ├── midi.py          /api/midi/*    (analyze)
│   │   └── lyrics.py        /api/lyrics/*  (analyze, generate)
│   └── services/
│       ├── ollama_client.py     Thin async wrapper around the Ollama HTTP API (functional now)
│       ├── audio_analysis.py    Audio feature extraction (Phase 3, stubbed)
│       └── midi_analysis.py     MIDI feature extraction (Phase 1, stubbed)
├── requirements.txt
└── .env.example
```

**Why routers call services instead of doing work inline:** each router is just HTTP
plumbing (validate request → call service → shape response). The services contain the actual
audio/MIDI/LLM logic and have no FastAPI dependency, so they're easy to unit test or reuse from a
script/notebook later.

**Why a single `ollama_client.py`:** every feature eventually needs "turn some structured data
into a natural-language response" or "have a conversation." Centralizing the Ollama call means the
model, host, and retry/timeout behavior are configured in one place instead of three.

## Frontend structure

```
frontend/
├── app/
│   ├── layout.tsx            Root layout: dark theme shell + nav
│   ├── page.tsx               Landing page, links to the three features
│   ├── coach/page.tsx          AI Coach UI (upload + feedback + chat)
│   ├── midi-analyzer/page.tsx  MIDI Analyzer UI (upload + results table)
│   └── lyrics/page.tsx         Lyric Lab UI (textarea + analyze/generate)
├── components/
│   ├── NavBar.tsx
│   └── FeatureCard.tsx
├── lib/
│   └── api.ts                 fetch() wrappers for every backend endpoint
└── .env.local.example
```

Each feature page owns its own local state (uploaded file, form values, results) — there's no
global state manager yet. If Phase 4 adds persisted history across pages, revisit this (React
Context or a small store) rather than introducing one prematurely.

## API contract (current stub shape)

All endpoints are prefixed `/api`. See `backend/app/models/schemas.py` for the exact Pydantic
models — this is a summary:

| Method | Path                  | Purpose                                          | Phase |
|--------|-----------------------|---------------------------------------------------|-------|
| POST   | `/api/midi/analyze`   | Upload a `.mid` file → key/BPM/mood/etc.           | 1     |
| POST   | `/api/lyrics/analyze` | Submit lyrics → critique                           | 2     |
| POST   | `/api/lyrics/generate`| Submit lyrics + prompt → generated lines           | 2     |
| POST   | `/api/coach/upload`   | Upload an audio file → `track_id`                  | 3     |
| POST   | `/api/coach/feedback` | `track_id` → structured feedback                   | 3     |
| POST   | `/api/coach/chat`     | `track_id` + message history → follow-up response  | 3     |

Until a phase is implemented, its endpoint(s) return `501 Not Implemented` with a message pointing
back to [PLAN.md](PLAN.md).

## Data storage

- **Uploads** (audio/MIDI files): written to `backend/uploads/` (gitignored), referenced by an id.
  No cloud storage — this is a local-first tool.
- **History/metadata**: not implemented yet. Phase 4 adds SQLite for storing past analyses/chats
  so users can revisit them. Deliberately deferred — no point designing a schema before the shape
  of the data (from Phases 1-3) is known.

## Why Ollama instead of a hosted API

No API key or account needed to try the project, zero marginal cost per request, and everything
stays on the user's machine (relevant since audio files can be large/personal). The
`ollama_client.py` wrapper is the only place that knows about Ollama specifically — swapping to a
hosted model later (e.g. Anthropic's API) means changing that one file, not every router.
