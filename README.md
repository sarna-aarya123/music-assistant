# AI Music Assistant

Upload a beat and explore it. The app measures the audio, draws the whole track as a 3D waveform
in a studio, and lets you step into any 30 seconds to see what is happening in that span.

**Live:** Vercel (frontend) + Render free tier (backend). The first request after idle can take up
to a minute while the free-tier server wakes up.

## What it does

- **Audio analysis** — BPM, key, loudness, brightness, spectral rolloff, dynamic range, low-end
  ratio, onset density, plus beat and onset timestamps. All computed in Python with `librosa`, and
  re-sampled to one reading per second (loudness, brightness, low-end share, onsets) so any span of
  the track can be measured instantly in the browser.
- **3D waveform** — the whole track as a row of bone-white slats standing on a long desk in a
  seamless grey room. Hover to preview any 30 seconds, click to pick it.
- **Desk close-up** — the camera dives into the picked span and onto a retro desk built from
  photo-scanned props. Click the cassette recorder (loudness), radio (tone), boombox (low-end
  weight) or TV (how much the level moves) for that span's own numbers, compared against the whole
  track. The TV's screen draws the span's loudness curve. A "play this section" button plays the
  30 seconds.
- **Estimated mood** — energy and tone are scored from the measurements and give the screen a slight
  tint. It is an estimate, and deliberately does not use major/minor key.
- **Local AI (backend only for now)** — with [Ollama](https://ollama.com) running locally, the
  backend can write a plain-language read of a section. Python measures every number; the model only
  interprets a fixed fact sheet, and any number or key in its reply that isn't in that sheet is
  flagged. The deployed site has no Ollama, and this isn't shown in the interface at the moment.

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, three.js via react-three-fiber
- **Backend:** FastAPI, librosa / soundfile / NumPy, SQLite (history)
- **Optional AI:** Ollama (default model `llama3:8b`)
- **Hosting:** Vercel + Render, with a GitHub Actions ping to keep the backend warm

## Major changes

1. **Initial build** — three tools: MIDI analyzer, lyric analyzer, audio coach.
2. **Persistence and polish** — SQLite history, upload limits, error handling.
3. **Early visual redesigns** — a dark HUD look, then a bright arcade theme, then a dark neon style
   with switchable colorways.
4. **Deterministic analysis** — replaced model-written feedback with measured features and
   rule-based text; went deeper on the Python side.
5. **Performance** — removed a duplicate analysis pass (about 2x faster uploads), offloaded blocking
   work from the event loop, added a keep-alive ping and a "server waking up" hint for Render's
   free tier.
6. **Single-tool pivot** — dropped the MIDI and lyric tools to focus on one interactive experience.
7. **Song Map** — whole-song view with detected markers and a per-section deep dive.
8. **Local AI layer** — grounded per-section reads and chat via Ollama, checked against the
   measured numbers.
9. **Per-second analysis and mood** — the backend returns one reading per second and an estimated
   mood, so any span the user picks is measured in the browser with no extra request.
10. **3D waveform and studio** — replaced the section map with a full-screen 3D waveform where
    any 30 seconds can be picked, and a studio close-up where each piece of gear reports on that span.
11. **New visual identity** — dropped the neon look, then the paper-and-ink look, for a black
    typewriter interface (Courier Prime, small black label chips) around a photo-scanned retro desk
    on a seamless grey backdrop. Replaced the library that placed labels inside the 3D scene with a
    small projector that moves normal page elements, which fixed teardown errors under React 19.

## Credits

- **Props and lighting** (all CC0, from [Poly Haven](https://polyhaven.com)): metal office desk,
  modern arm chair, Television 01, boombox, cassette player, vintage radio transceiver, potted
  plant 01, desk lamp arm 01, and the PAV Studio 03 lighting map.
- **Font** (SIL Open Font License): Courier Prime.

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
