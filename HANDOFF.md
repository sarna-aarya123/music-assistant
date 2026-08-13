# Handoff

## Purpose

Local-first-turned-deployed music assistant for producers in the rage/plugg lane (Ken Carson,
Playboi Carti, OsamaSon, Draco FM as style references). Three independent features, all fully
deterministic Python — no AI/LLM is wired up to any active route. Ollama integration exists in the
codebase but is intentionally disconnected, kept only so a future AI layer doesn't require
rebuilding from scratch (see "AI is disconnected, not deleted" below).

## Current working features

1. **MIDI Analyzer** — upload a `.mid`/`.midi`, get BPM, time signature, key, note density, pitch
   range, velocity, track count, polyphony, syncopation, etc. — all `pretty_midi`, rule-based
   `feel_summary`/`notes`/`suggestions`, no model call.
2. **Lyric Lab** — paste lyrics, get critique (rhyme scheme, syllables/cadence, repetition) via the
   CMU Pronouncing Dictionary (`pronouncing`/`cmudict`) with a heuristic fallback for OOV/slang.
   Line generation is disconnected.
3. **AI Coach** — upload audio (`.wav/.mp3/.m4a/.flac/.aiff`), get BPM, key, RMS, spectral
   brightness/rolloff, zero-crossing rate, dynamic range, low-end ratio, onset density — all
   `librosa`, rule-based `strengths`/`improvements`. Follow-up chat is disconnected.

All three persist history to SQLite ("Recent" panel per page). Visual identity is "Crystal Arcade"
— bright glossy JRPG-menu look, hand-drawn SVG fox mascot, pastel/candy Tailwind palette.

## AI is disconnected, not deleted

`ollama_client.py`, `lyrics_lab.generate_lines()`, `audio_analysis.continue_chat()`, and the
matching schemas/history columns are all still in the codebase and functional, just not wired to
any router or UI. `routers/system.py` exists but isn't registered in `main.py`. To reconnect:
add a router endpoint calling the kept service function and rebuild the corresponding frontend UI
(see git history for the old `UseAiToggle`/chat-box/Generate-Lines UI).

## Deployment: live on Vercel (frontend) + Render (backend)

- **Frontend**: Vercel project, root directory `frontend`, env var
  `NEXT_PUBLIC_API_BASE_URL=https://music-assistant-backend-ttq5.onrender.com`.
- **Backend**: Render web service, root directory `backend`, build `pip install -r
  requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check
  `/health`. Env vars: `PYTHON_VERSION=3.13.5`, `UPLOAD_DIR=./uploads`,
  `CORS_ORIGINS=https://music-assistant-app.vercel.app`.
- SQLite (`app.db`) and uploads live on Render's local disk — **ephemeral**: wiped on redeploy and
  on free-tier idle spin-down. Fine for now; a persistent disk or hosted DB is the follow-up if
  history durability matters.
- Free-tier Render caveats: cold start after ~15min idle; 512MB RAM ceiling (see below).

## The Coach OOM saga (this session's main work)

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
   Fixed with `tuning=0` (documented tradeoff: skips per-track tuning correction, immaterial for
   this genre's typically-standard-pitch content) plus a coarser `_SPECTRAL_HOP_LENGTH = 1024` for
   that shared STFT only (onset/beat detection stays at hop=512 for timing precision). **Measured
   result on the real production code path: peak dropped from 570MB to ~401MB** — confirmed via a
   background RSS-sampling script against a synthetic ~2:55 track, not just estimated.

Notably, the "numba/llvmlite import baseline is fundamentally too large for 512MB" theory was
empirically **refuted** mid-investigation: full app import is only ~77MB, and repeated in-process
calls showed no JIT-amortization drop, meaning it was genuine per-call array allocation
(traceable and fixable), not an unavoidable architectural floor.

Test coverage for all of this lives in `backend/tests/test_coach_audio.py` (8 tests): response
contract preservation, duration-cap rejection, event-loop responsiveness under load, numeric
equivalence of the shared-onset-envelope dedup vs. independent computation, and numeric closeness
of the `tuning=0`/coarser-hop spectral change vs. the pre-optimization behavior.

## Known bugs/issues

- No automated frontend test suite; backend now has `backend/tests/` (pytest, 8 tests, all
  passing) added during the OOM debugging.
- Heuristic rhyme-key fallback (Lyric Lab, non-CMU-dict words) and MIDI syncopation proxy are both
  documented simplifications, unchanged this session.
- Render free-tier disk is ephemeral — history/uploads reset on redeploy or idle spin-down.

## Next task

Nothing blocking. Production Coach upload is verified working end-to-end on Render's free tier
after the memory/concurrency fixes above. No next task defined — check with the user.
