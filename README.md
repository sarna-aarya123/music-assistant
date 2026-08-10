# AI Music Assistant

An accessible AI production companion for producers working in the rage / plugg / hyperpop-trap
lane (think Ken Carson, Playboi Carti, OsamaSon, Draco FM). The goal is to lower the barrier to
finishing tracks by giving bedroom producers the kind of feedback and analysis a mentor or
engineer would normally give.

> Status: **scaffolding stage**. Nothing is fully implemented yet — see [PLAN.md](PLAN.md) for the
> build order and [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## The three features

1. **AI Coach** — upload a beat / melody / drum loop, get structured feedback (mix, arrangement,
   sound selection, energy), then ask follow-up questions in a chat.
2. **MIDI Analyzer** — upload a `.mid` file, get back key, BPM, time signature, note density,
   chord/mood read, and a plain-English "feel" description.
3. **Lyric Lab** — paste lyrics, get critique (flow, rhyme density, repetition, cadence) or ask
   for a handful of generated lines that match the style/flow of what's already written.

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend:** FastAPI (Python)
- **LLM:** [Ollama](https://ollama.com) running locally (no cloud API key required) — swappable
  later for a hosted model.
- **Audio analysis:** librosa / soundfile
- **MIDI analysis:** pretty_midi / mido

## Repo layout

```
MUSIC ASSISTANT/
├── frontend/         Next.js app (UI for all three features)
├── backend/          FastAPI app (routers, services, LLM + analysis glue)
├── docs/             Per-feature specs
├── PLAN.md           Phased build roadmap — read this first
└── ARCHITECTURE.md   System design, data flow, API contract overview
```

## Getting started (once you start implementing a phase)

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Make sure [Ollama](https://ollama.com) is installed and running (`ollama serve`) with a model
pulled, e.g. `ollama pull llama3.1`.

**Frontend**

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Then open http://localhost:3000. The frontend expects the backend at http://localhost:8000 by
default (configurable via `NEXT_PUBLIC_API_BASE_URL`).

## Build order

Don't build all three features at once. Follow [PLAN.md](PLAN.md):
`Phase 1: MIDI Analyzer → Phase 2: Lyric Lab → Phase 3: AI Coach → Phase 4: Polish`.
