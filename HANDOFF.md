# Handoff

## Purpose

Deployed music assistant, now scoped to **one interactive tool**: upload a beat, get deterministic
Python audio analysis, and explore it through an audio-reactive waveform visualizer. This is a
deliberate pivot (this session) away from the original three-feature scope (MIDI Analyzer + Lyric
Lab + AI Coach) — the user wants something demoable/interactive for college applications (due
Nov 1) rather than three separate "upload → read a report" pages. All analysis is still fully
deterministic Python — no AI/LLM is wired up to any active route. Ollama integration exists in the
codebase but is intentionally disconnected (see "AI is disconnected, not deleted" below).

## Current shape of the app

- **One page** (`frontend/app/page.tsx`, formerly `app/coach/page.tsx`): upload a song
  (`.wav/.mp3/.m4a/.flac/.aiff`) → once analyzed, the upload form disappears entirely and is
  replaced by `WaveformExplorer` (full-width, 60–70vh tall) plus a compact 3-column metadata strip
  (Stats / Strengths / Improvements) below it. "Analyze another track" resets back to the upload
  form. MIDI Analyzer and Lyric Lab are **removed from the frontend** — their `/midi-analyzer` and
  `/lyrics` routes now 404, and the homepage/NavBar no longer link to them. Their backend routers/
  services are untouched and still deployed, just unlinked from the UI (see below) — nothing was
  git-deleted on the backend.
- **`components/WaveformExplorer.tsx`** — the centerpiece. Not a static waveform: it's a real-time,
  audio-reactive bar visualizer driven by a Web Audio `AnalyserNode` connected to the actual
  `<audio>` playback (`createMediaElementSource` → `analyser` → `destination`, wired lazily on the
  first Play click since browsers require a user gesture for this). 64 bars, each spring-animated
  (position + velocity, eased toward a target rather than snapping) for a bouncy/toon feel rather
  than a flat technical meter; idle (paused) state is a slow traveling sine wave so it's never
  static. Every detected beat (`beat_times`, from the backend) gives all bars a shared "boost" plus
  a tiny scale-pop on the whole panel, decaying out — this is intentionally more of a "thump" than
  a flash. Peaks are capped at 75% of the panel height (`PEAK_CAP`) so a loud/dense section never
  maxes out visually. Beat-grid lines and onset ticks are drawn using `onset_times`/`beat_times`
  from the backend; click/drag anywhere seeks. No literal amplitude waveform is drawn anymore (was
  removed per user feedback — "get rid of the actual waveform, just the interactive one") — there
  used to be a client-side `decodeAudioData` pass to compute min/max peaks for that; it's gone now,
  so the component starts up faster and doesn't need to fully decode the file at all anymore.
- **Colorway/theme system** — `components/ThemeSwitcher.tsx` (4 pill swatches in the NavBar: Solar/
  Aurora/Toxic/Inferno) sets `data-theme` on `<html>`, persists to `localStorage`, and dispatches a
  `themechange` window event. Every color in the app resolves through CSS variables
  (`--color-accent`/`--color-accent2`/`--color-gold`/`--color-background`/`--color-surface`/
  `--color-border`/`--color-ink`/`--color-muted`), defined per-theme in `globals.css` under
  `[data-theme="..."]`. `tailwind.config.ts` colors are all `rgb(var(--color-x) / <alpha-value>)` —
  every pre-existing `bg-accent`/`text-accent2`/`border-accent/40`-style class kept working with
  zero call-site changes. The one place that needed real code (not just CSS) is
  `WaveformExplorer.tsx`'s canvas: canvas `fillStyle` can't read a CSS `var()` directly, so
  `readThemeColors()` resolves the variables via `getComputedStyle` into literal `rgb(...)`
  strings, cached in a ref, refreshed on the `themechange` event. A blocking inline script in
  `app/layout.tsx`'s `<head>` applies the saved theme before paint (no flash of the default theme
  for returning visitors). Only the three accent colors vary by theme currently — background/
  surface/border/ink/muted are shared across all four for legibility; this was a deliberate scope
  cut this session, not a limitation of the variable system (adding per-theme base-color variants
  later is just more CSS in the same blocks).
- Backend gained `onset_times`/`beat_times` (actual timestamp arrays, not just aggregates) on
  `TrackFeatures` — this is what feeds the beat grid/onset markers/beat-boost pulse. Defaulted to
  `[]` for history-backcompat, same pattern as the other depth fields.

## AI is disconnected, not deleted

`ollama_client.py`, `lyrics_lab.generate_lines()`, `audio_analysis.continue_chat()`, and the
matching schemas/history columns are all still in the codebase and functional, just not wired to
any router or UI. `routers/system.py` exists but isn't registered in `main.py`. `routers/midi.py`
and `routers/lyrics.py` are **still registered and functional** (unlike the AI stuff) — they're
just not linked from the frontend anymore. To reconnect any of it: add a router endpoint (or a
frontend page/nav link, for MIDI/Lyrics) and rebuild the corresponding UI (see git history for the
old MIDI Analyzer/Lyric Lab pages, `UseAiToggle`, chat box, Generate-Lines UI).

## Deployment: live on Vercel (frontend) + Render (backend)

- **Frontend**: Vercel project, root directory `frontend`, env var
  `NEXT_PUBLIC_API_BASE_URL=https://music-assistant-backend-ttq5.onrender.com`.
- **Backend**: Render web service, root directory `backend`, build `pip install -r
  requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check
  `/health`. Env vars: `PYTHON_VERSION=3.13.5`, `UPLOAD_DIR=./uploads`,
  `CORS_ORIGINS=https://music-assistant-app.vercel.app`.
- SQLite (`app.db`) and uploads live on Render's local disk — **ephemeral**: wiped on redeploy and
  on free-tier idle spin-down.
- **Cold starts**: measured ~41s cold, sub-200ms warm. `.github/workflows/keep-alive.yml` pings
  `/health` every 10 minutes via GitHub Actions (free on this public repo) to keep the instance
  from spinning down during active use — best-effort, not a guarantee (a new deploy always
  restarts the instance regardless). `frontend/lib/useSlowLoadHint.ts` shows a "waking up the
  server" message after 4s of loading, for whenever a cold start does happen.
- **Fixed a real perf bug this backend session**: `/api/coach/upload` used to call
  `extract_features()`, which ran the *entire* librosa pipeline just to read `duration_sec` off the
  result — then `/api/coach/feedback` ran that same full pipeline again. Every analysis was doing
  the expensive work twice. Fixed via `_probe_duration()` — a cheap header-only duration read, no
  full decode. Measured on production: a 145s file went from ~207s (~3.4min, matching what the user
  reported) to ~111s (~1.9min) end-to-end. The single full pass itself is still ~100s on Render's
  free CPU for a track that length — that's real, unoptimized-further CPU throttling on the free
  tier, not a bug; see "Known bugs/issues".

## The Coach OOM saga (prior session's main work — still relevant background)

Getting `/api/coach/upload` reliable on Render's 512MB free instance took three rounds:

1. **Native-sample-rate decode** (`librosa.load(sr=None)`) meant large PCM arrays scaled with the
   file's native rate. Fixed: decode at a fixed `_TARGET_SR = 22050`, added `_MAX_DURATION_SEC =
   300` (5 min) with a cheap pre-decode duration probe (`librosa.get_duration(path=...)`) plus a
   post-decode backstop. Also deduplicated 3 redundant internal STFT computations
   (`chroma_stft`/`spectral_centroid`/`spectral_rolloff` were each recomputing their own) into one
   shared magnitude spectrogram passed via `S=`.
2. **Event-loop blocking** — fixing memory didn't fix a second failure mode: `/health` timing out
   with no OOM event. Root cause: `_extract()` (CPU-bound librosa work) and the upload file-write
   loop ran synchronously *inside* `async def` route handlers with no thread offload, so Render's
   single uvicorn worker/event loop was fully occupied during analysis — including for its own
   health probe, causing Render to kill the "unresponsive" instance mid-request. Fixed by wrapping
   both in `anyio.to_thread.run_sync(...)`.
3. **Remaining OOM** — memory fixes above weren't enough; a real ~3min/3.1MB file still OOM'd.
   Empirically profiled (background RSS sampler, not just theory) and found `librosa.beat.beat_track`
   and `librosa.onset.onset_detect` were each independently computing their own onset-strength
   envelope from scratch — a second hidden full spectral pass. Fixed by computing one
   `onset_strength()` envelope and sharing it via `onset_envelope=`. Also scoped the STFT/chroma/
   centroid/rolloff block into its own `_spectral_features()` helper so those arrays are released
   the instant it returns instead of lingering as `_extract`'s locals. Peak dropped some but not
   enough (~570MB measured). Deeper profiling found the *actual* single largest allocation in the
   whole pipeline: `chroma_stft()`'s default automatic tuning estimation (`tuning=None`) runs its
   own internal pitch-tracking pass over the full spectrogram — bigger than the STFT it's built on.
   Fixed with `tuning=0` plus a coarser `_SPECTRAL_HOP_LENGTH = 1024` for that shared STFT only
   (onset/beat detection stays at hop=512 for timing precision). **Measured result: peak dropped
   from 570MB to ~401MB.**

Test coverage for all of this lives in `backend/tests/test_coach_audio.py` (8 tests).

## Known bugs/issues

- **A single full analysis pass on Render's free CPU is still slow** — ~100s for a ~2:25 track,
  scaling with duration. The 2x-redundancy bug above is fixed; this remaining number is real CPU
  throttling on the free tier, not a code inefficiency. The only further lever without paying for
  compute would be capping how much of the track actually gets analyzed (e.g. first/middle
  60-90s) — not done, since it wasn't asked for and trades off analysis completeness.
- Base background/surface/border/ink/muted colors don't vary by colorway (only the 3 accents do) —
  a deliberate scope cut, not a limitation; see the theme system section above.
- No automated frontend test suite; backend has `backend/tests/` (pytest, 8 tests, all passing).
- Render free-tier disk is ephemeral — history/uploads reset on redeploy or idle spin-down.
- `docs/FEATURE_*.md`, `PLAN.md`, `ARCHITECTURE.md` describe the original three-feature scope and
  are now stale/historical — this file is the accurate current state.

## Next task

User's target: fully "knock out" this pivot within a week (college apps due Nov 1). Tonight's work
(waveform explorer, layout rework, MIDI/Lyric Lab removal from frontend, colorway system) is
committed and pushed. No next task defined yet beyond that — check with the user. Worth asking
early next session whether MIDI Analyzer/Lyric Lab should be fully deleted from the backend too
(currently just unlinked, per this session's time-pressured default — see "AI is disconnected, not
deleted" above) once the user has had a chance to decide.
