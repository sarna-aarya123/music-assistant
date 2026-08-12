# Handoff

## Purpose

Local-first AI assistant for producers in the rage/plugg lane (Ken Carson, Playboi Carti,
OsamaSon, Draco FM as style references). Three independent features, no account, no cloud API key
— everything runs against a local Ollama instance. Full narrative docs: `README.md`, `PLAN.md`,
`ARCHITECTURE.md`, `docs/FEATURE_*.md`.

## Current working features (all three phases + polish complete)

1. **MIDI Analyzer** — upload a `.mid`/`.midi` file, get BPM, time signature, key, note density,
   pitch range, avg velocity, track count (deterministic, `pretty_midi`), plus an optional
   Ollama-generated feel/mood summary + suggestions.
2. **Lyric Lab** — paste lyrics, get critique (rhyme/repetition/cadence/imagery, line-by-line) or
   generate N candidate lines matching an existing flow. Pure LLM feature, no non-AI mode.
3. **AI Coach** — upload an audio file (`.wav/.mp3/.m4a/.flac/.aiff`), get deterministic features
   (BPM, key, RMS loudness, spectral brightness via `librosa`) plus optional Ollama-generated
   strengths/improvements/follow-up questions, then multi-turn chat grounded in those features.

All three persist history to SQLite and expose it via a "Recent" panel on each page (click to
reload a past result). Visual identity (Anton display font, sharp corners, noise texture, glitch
hover accents) is done. File-size caps and basic error/loading polish are done.

## Architecture

- **Backend**: FastAPI (`backend/app/`), routers are thin (validate → call service → shape
  response), all logic lives in `backend/app/services/*.py`.
  - `routers/{midi,lyrics,coach}.py` — one per feature, prefixed `/api/{midi,lyrics,coach}`.
  - `services/midi_analysis.py`, `services/audio_analysis.py`, `services/lyrics_lab.py` — feature
    logic. Both MIDI and Coach split deterministic feature extraction (library-only, always works)
    from an LLM narrative layer (optional, `ai_available` flag on the response). Lyric Lab has no
    non-AI mode — critique/generation are inherently LLM tasks, so `OllamaError`→503 and
    unparseable-output (`LyricsLLMError`)→502 propagate straight to the router.
  - `services/ollama_client.py` — the **only** place that talks to Ollama's HTTP API
    (`chat()`/`generate()`). Also owns `parse_json_response()`, a shared helper that strips
    markdown code fences and repairs a `\'` escape bug `llama3:8b` regularly emits — every feature
    that parses LLM JSON output routes through this rather than hand-rolling `json.loads`.
  - `services/history.py` — the only place that owns SQLite specifics (`save_*`/`list_*`/`get_*`
    per feature), mirroring how `ollama_client.py` owns Ollama specifics.
  - `core/db.py` — schema (5 tables: `midi_analyses`, `lyric_sessions`, `coach_tracks`,
    `coach_feedback`, `coach_chat_messages`) + `init_db()` (called from `main.py`'s `lifespan`) +
    an `aiosqlite` `connect()` context manager (fresh connection per call, no pooling — fine for a
    single-user local tool).
  - `core/config.py` — `pydantic-settings`, reads `backend/.env` (`OLLAMA_HOST`, `OLLAMA_MODEL`,
    `UPLOAD_DIR`, `CORS_ORIGINS`; `db_path` defaults to `./app.db`, not env-configurable).
  - `models/schemas.py` — all request/response Pydantic models, shared contract with the frontend.
  - No auth. Uploaded files go to `backend/uploads/` (gitignored); Coach's in-memory
    `_track_context` dict (keyed by `track_id`) is the fast path for chat grounding, with
    `history.get_coach_context()` as a SQLite fallback when a track isn't in memory (e.g. after a
    restart).
- **Frontend**: Next.js App Router + TypeScript + Tailwind (`frontend/`).
  - One page per feature (`app/{coach,lyrics,midi-analyzer}/page.tsx`), each: upload/input form →
    result display (gated on `ai_available` where relevant) → "Recent" history panel. Pages never
    call `fetch()` directly — everything routes through `lib/api.ts`.
  - `lib/api.ts` — typed fetch wrappers + history types mirroring `schemas.py`. Every call goes
    through `safeFetch()`, which turns a network-level failure (backend unreachable) into a
    readable `ApiError` instead of a raw `TypeError`. `analyzeMidi()`/`uploadTrack()` reject
    oversized files client-side (10MB / 50MB) before making a request.
  - Visual identity: Anton font via `next/font/google` (`.font-display`), sharp corners (Tailwind
    `borderRadius` scale overridden globally), SVG noise+scanline texture (`.app-texture`), accent
    glow + two-tone glitch-flicker hover animation (`.glitch-text`).

## Important technical decisions/constraints

- **Deterministic-vs-LLM split is a hard rule** (see `CLAUDE.md`): a numeric fact (BPM, key,
  duration, loudness) must never come only from an LLM call. MIDI Analyzer and AI Coach both
  degrade to `ai_available: false` if Ollama is unreachable rather than erroring — the feature
  still fully works without AI. Lyric Lab is the sole exception (inherently LLM-only).
  New features should keep following this split.
- All new Ollama calls must go through `ollama_client.chat()`/`generate()`, not hit the HTTP API
  directly — this is the intended swap point if/when a hosted model replaces local Ollama later
  (explicitly optional/future, not scheduled).
- All LLM JSON parsing must go through `ollama_client.parse_json_response()`.
- Upload size caps: Coach 50MB, MIDI 10MB — enforced both server-side (chunked read, 413) and
  client-side (`lib/api.ts`, fails before any network call).
- `backend/app.db` (SQLite) is gitignored. **Never delete it while the server is running** —
  `history.py`'s `connect()` opens a fresh connection per call, so a mid-run delete silently
  recreates an empty DB with no tables (500s with "no such table"). Stop the server first, or just
  leave the file alone between sessions.
- Build order: this project was built one phase at a time (MIDI → Lyrics → Coach → Polish), per
  `PLAN.md`. Don't build a later phase's logic while working on an earlier one.

## Known bugs/issues

- **`llama3:8b` occasionally still returns unparseable JSON** despite the `parse_json_response()`
  repair pass (fences + `\'` fix) — e.g. live-verified this session: a MIDI analyze call returned
  `feel_summary: "Feel summary unavailable — the model returned unparseable output."` with the raw
  model text dumped into `notes` instead. This is a distinct, still-open case from the
  `ai_available=False` (Ollama unreachable) path — Ollama *is* reachable, it just emits malformed
  JSON sometimes. Not reproducible on every call with the same input. No further mitigation
  attempted beyond the existing fence-strip + escape-repair.
- No automated test suite exists for either backend or frontend — all verification so far has been
  manual (curl + live browser checks via the Claude Preview tool).
- No file-size/duration cap on Lyric Lab requests (only upload-based features have size caps —
  arguably fine since it's plain text, but unbounded).

## Next task

Nothing is currently blocking or in progress — Phase 4 (Polish) is complete and pushed
(`fed9b93` is the tip of `main`). The next open item is the last (optional/future, per the user)
bullet in `PLAN.md`'s Phase 4 section: **swap Ollama for a hosted model behind an env flag**, once
local-first is proven out. Not scheduled — no action needed until explicitly requested. Otherwise,
check with the user for what's next (a new feature/phase isn't yet defined in `PLAN.md` beyond
Phase 4).
