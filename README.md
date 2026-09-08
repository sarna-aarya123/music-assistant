# AI Music Assistant

Upload a beat, get real deterministic audio analysis (BPM, key, loudness, spectral shape, beat/
onset timing), and explore it through an interactive, audio-reactive waveform visualizer — click
or drag anywhere to scrub, and the bars react live to the actual sound as it plays, with a bounce
on every detected beat. Colorway switcher in the nav for a few different visual themes.

No AI/LLM call is involved anywhere — every number and piece of feedback is computed by plain
Python (`librosa`) and rule-based thresholds. Deployed live: Vercel (frontend) + Render free tier
(backend).

> This started as three planned features (MIDI Analyzer, Lyric Lab, AI Coach) with Ollama-backed
> narrative feedback — see [HANDOFF.md](HANDOFF.md) for the real, current history. It narrowed to
> this single interactive tool; PLAN.md/ARCHITECTURE.md describe the original three-feature scope
> and predate that change.

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend:** FastAPI (Python)
- **Audio analysis:** librosa / soundfile — all deterministic, no model calls

## Repo layout

```
MUSIC ASSISTANT/
├── frontend/         Next.js app — single page (app/page.tsx) + WaveformExplorer
├── backend/          FastAPI app (routers, services, audio analysis)
├── .github/workflows/ keep-alive ping for the Render free-tier backend
├── docs/             Per-feature specs (mostly historical — see HANDOFF.md)
├── PLAN.md           Original phased roadmap (historical)
└── ARCHITECTURE.md   Original system design doc (historical)
```

## Running it locally

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Then open http://localhost:3000. The frontend expects the backend at http://localhost:8000 by
default (configurable via `NEXT_PUBLIC_API_BASE_URL`). No external services (Ollama or otherwise)
are required.
