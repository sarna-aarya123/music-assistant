# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

AI Music Assistant — now a single-feature site: upload a beat, get deterministic Python audio
analysis (BPM/key/loudness/spectral shape/onsets/beats), and explore it through an interactive,
audio-reactive waveform visualizer. Originally scoped as three separate tools (MIDI Analyzer,
Lyric Lab, AI Coach) — MIDI Analyzer and Lyric Lab were removed from the frontend (their backend
routers/services still exist, just unregistered/unlinked — see HANDOFF.md) once the product
direction narrowed to "one interactive audio tool" instead of three report-generator pages.
Full context: [HANDOFF.md](HANDOFF.md) (the accurate, current source of truth — PLAN.md/
ARCHITECTURE.md/README.md predate this pivot and are stale).

## No AI/LLM on any active route

Every number and piece of feedback the app shows is computed deterministically in Python
(`librosa`) — there is no model call anywhere in the live product. Ollama integration
(`backend/app/services/ollama_client.py`, disconnected chat/generation code) is kept in the
codebase but not wired to any route, so it can be reconnected later without a rebuild. Don't
reintroduce an LLM call into the feedback path without the user asking for it specifically.

## Stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind — `frontend/`, single page at `app/page.tsx`.
- Backend: FastAPI (Python) — `backend/`, only `routers/coach.py` is registered in `main.py`.
- Audio: librosa/soundfile. (MIDI: pretty_midi/mido — still present, only used by the disconnected
  MIDI Analyzer code.)
- Deployed: Vercel (frontend) + Render free tier (backend) — see HANDOFF.md for URLs, the Render
  cold-start situation, and the GitHub Actions keep-alive workaround.

## Where things go

- Routers (`backend/app/routers/*.py`) are thin: validate request, call a service, shape the
  response. All real logic lives in `backend/app/services/*.py`.
- Shared request/response types live in `backend/app/models/schemas.py`; the frontend's mirror of
  these lives in `frontend/lib/api.ts`. Keep both in sync when a shape changes.
- `frontend/components/WaveformExplorer.tsx` is the centerpiece — canvas-drawn, audio-reactive
  (Web Audio `AnalyserNode`) bar visualization with beat/onset overlays and click-to-seek. It reads
  colors live via `getComputedStyle` (see next section) rather than hardcoded hex, since canvas
  can't use CSS `var()` directly.

## Colorway/theme system

Every themeable color resolves through CSS variables (`--color-accent`/`--color-accent2`/
`--color-gold`/etc.), defined per-theme in `globals.css` under `[data-theme="..."]`, applied via
`data-theme` on `<html>`. `tailwind.config.ts` colors are all `rgb(var(--color-x) / <alpha-value>)`
so every existing `bg-accent`/`text-accent2`/`border-accent/40`-style class works unchanged across
themes. `components/ThemeSwitcher.tsx` sets the attribute + persists to `localStorage` + dispatches
a `themechange` window event (WaveformExplorer listens for this to refresh its cached canvas
colors, since canvas fillStyle needs a literal resolved color, not a CSS variable reference).
**When adding new themed UI**: use the existing Tailwind color tokens (`accent`/`accent2`/`gold`/
etc.) or `rgb(var(--color-x))` directly — never a hardcoded hex for anything meant to reflect the
active colorway. Adding a new colorway = one more `[data-theme="name"]` block in `globals.css` +
one entry in `THEME_PREVIEWS`/`THEMES` in `ThemeSwitcher.tsx`.

## Running things

```bash
# backend
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload
# frontend
cd frontend && npm run dev
```

No local services (Ollama or otherwise) are required for anything currently live to work.

## Conventions

- Deterministic feature extraction stays separate from any narrative text — `_describe_features()`
  in `audio_analysis.py` produces the strengths/improvements as plain Python threshold rules, not a
  model call. Don't let an LLM call become the only source of a numeric fact.
- No auth, no accounts. SQLite history (`backend/app.db`, gitignored) — ephemeral on Render's free
  tier (wiped on redeploy/idle spin-down), so don't design around it persisting in production.
- Keep the assistant's tone in generated feedback like a knowledgeable peer, not a grading rubric —
  specific and concrete over generic praise/criticism.
