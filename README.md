# AI Music Assistant

Upload a beat and explore it. The app analyzes the audio, draws the whole song as an interactive
map, and lets you click into any section for a detailed read on that part of the track.

**Live:** Vercel (frontend) + Render free tier (backend). The first request after idle can take up
to a minute while the free-tier server wakes up.

## What it does

- **Audio analysis** — BPM, key, loudness, brightness, spectral rolloff, dynamic range, low-end
  ratio, onset density, plus beat and onset timestamps. All computed in Python with `librosa`.
- **Interactive waveform** — audio-reactive bars driven by the Web Audio API, with a beat grid,
  onset ticks, click/drag scrubbing, and a pulse on every detected beat.
- **Song Map** — the full track's loudness curve with markers at algorithmically detected
  structural moments (novelty detection over loudness and brightness). Click a marker to zoom into
  that section and see its own loudness, brightness and rhythmic density, compared against the
  rest of the track.
- **Local AI producer (optional)** — if [Ollama](https://ollama.com) is running locally, each
  section gets a plain-language read and a follow-up chat. Python measures every number; the model
  only interprets a fixed fact sheet, and any number or key in its reply that isn't in that sheet
  is flagged in the UI. On the deployed site Ollama isn't available, so this panel simply doesn't
  appear.
- **Colorways** — four switchable color themes.

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, canvas + Web Audio
- **Backend:** FastAPI, librosa / soundfile / NumPy, SQLite (history)
- **Optional AI:** Ollama (default model `llama3:8b`)
- **Hosting:** Vercel + Render, with a GitHub Actions ping to keep the backend warm

## Major changes

1. **Initial build** — three tools: MIDI analyzer, lyric analyzer, audio coach.
2. **Persistence and polish** — SQLite history, upload limits, error handling.
3. **Visual redesigns** — from a dark HUD look to a bright arcade theme, then to the current dark
   neon style with switchable colorways.
4. **Deterministic analysis** — replaced model-written feedback with measured features and
   rule-based text; went deeper on the Python side.
5. **Performance** — removed a duplicate analysis pass (about 2x faster uploads), offloaded blocking
   work from the event loop, added a keep-alive ping and a "server waking up" hint for Render's
   free tier.
6. **Single-tool pivot** — dropped the MIDI and lyric tools to focus on one interactive experience.
7. **Song Map** — whole-song view with detected markers and a per-section deep dive.
8. **Local AI layer** — grounded per-section reads and chat via Ollama, checked against the
   measured numbers.

## Run it locally

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

Open http://localhost:3000. The frontend expects the backend at http://localhost:8000 (override
with `NEXT_PUBLIC_API_BASE_URL`).

**Optional AI panel**

```bash
ollama pull llama3:8b
ollama serve
```

## Tests

```bash
cd backend
pytest
```
