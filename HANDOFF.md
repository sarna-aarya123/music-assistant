# Project Handoff (v2)

Written because the session ran out of context. This replaces the previous HANDOFF.md (which
covered through end of Phase 3) — everything in that one is now folded in here. **Code changes
described below were made this session and are real, but some are UNCOMMITTED — see "Git state"
before doing anything else.**

## Purpose

AI Music Assistant — three features for producers in the rage/plugg lane (style references: Ken
Carson, Playboi Carti, OsamaSon, Draco FM). Local-first: runs entirely via a local Ollama instance,
no account, no cloud API key.

1. **MIDI Analyzer** (Phase 1) — done.
2. **Lyric Lab** (Phase 2) — done.
3. **AI Coach** (Phase 3) — done.
4. **Polish** (Phase 4) — in progress, this session's work. Three sub-parts: visual identity
   (done, committed, pushed), SQLite history persistence (done, **uncommitted**), error/loading
   polish (not started).

Full narrative docs: `README.md`, `PLAN.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `docs/FEATURE_*.md`.
PLAN.md is up to date through Phase 3; it has NOT yet been updated to reflect Phase 4 progress.

## Repo / GitHub

- Git-initialized and pushed to **`https://github.com/sarna-aarya123/music-assistant`** (public).
- `gh` CLI is installed and authenticated as `sarna-aarya123` on this machine (`gh auth status` to
  confirm). Auth was set up this way because the user asked to use the `sarnaaarya@gmail.com`
  GitHub account specifically, not whatever `git config` had locally (that's a different email,
  `aarya.sarna@gmail.com` — just an artifact of local git config, not meaningful).
- **Standing instruction from the user: push to git every time an update is made or when moving to
  a new phase.** Don't batch multiple phases into one push.

## Git state RIGHT NOW — read this first

Last commit (`4e9b67b`, pushed) is the Phase 4 visual identity work. **Everything below that is
implemented, tested, and working, but sitting uncommitted in the working tree**:

```
Modified:
  backend/app/core/config.py
  backend/app/main.py
  backend/app/models/schemas.py
  backend/app/routers/coach.py
  backend/app/routers/lyrics.py
  backend/app/routers/midi.py
  backend/app/services/audio_analysis.py
  backend/requirements.txt
  frontend/app/coach/page.tsx
  frontend/app/lyrics/page.tsx
  frontend/app/midi-analyzer/page.tsx
  frontend/lib/api.ts
  frontend/next-env.d.ts
Untracked:
  backend/app/core/db.py
  backend/app/services/history.py
```

This is all the **SQLite persistence** sub-part of Phase 4 (see below). It was manually verified
working end-to-end (curl + a live browser preview session) but **never committed** — the session
was interrupted (laptop needed to charge) right after verification, before the commit step.

**First thing next session: review this diff, then commit and push it** (with a message
describing SQLite history persistence — model it on the commit style of `4e9b67b`/`f8499d3`/etc.,
i.e. explain *why* not just *what*, and note it was verified end-to-end). Don't just blindly
commit without a quick read — re-verify the backend still boots and a couple of endpoints respond,
since some time may have passed.

## What's done this session, in order

### 1. GitHub account setup + push (committed)
Installed `gh` CLI via winget, ran `gh auth login --web` (device-code flow, user authenticated in
browser as `sarna-aarya123`), created the `music-assistant` repo (public) via
`gh repo create --source=. --remote=origin --push`. Also did general repo housekeeping before this:
git-init, removed leftover test upload files, added `.claude/` to `.gitignore` (it holds Claude
Code's own local tool state — lockfiles, `settings.local.json` — that had gotten swept up by
`git add -A`, not project source).

### 2. Phase 2 — Lyric Lab (committed: `409c38f`)
Implemented `backend/app/services/lyrics_lab.py` (`analyze_lyrics`, `generate_lines`) — both call
Ollama with structured JSON prompts. No non-AI fallback here by design (see CLAUDE.md convention
below) — critique/generation are inherently LLM tasks. Router maps `OllamaError`→503,
unparseable-output (`LyricsLLMError`)→502. Frontend renders the line-by-line breakdown. Verified
end-to-end against live Ollama (`llama3:8b`).

### 3. Phase 3 — AI Coach (committed: `f8499d3`)
Implemented `backend/app/services/audio_analysis.py`. Deterministic features (BPM, key, RMS
loudness, spectral brightness/centroid) via `librosa` alone, no LLM — mirrors the MIDI Analyzer's
"Ollama optional" split via a new `ai_available` field added to `CoachFeedbackResponse` (it was
missing from the original schema stub). Ollama layers on strengths/improvements/follow-up
questions; chat is grounded in features + prior feedback via an in-memory `_track_context` dict
keyed by `track_id`.

**Bug found and fixed here, worth knowing about:** `llama3:8b` regularly emitted invalid `\'` JSON
escapes and, under a verbose prompt, sometimes left arrays/objects unclosed (valid `done_reason:
stop` from Ollama, just genuinely malformed JSON — not a token-limit truncation issue). Fixed with:
- A shared `ollama_client.parse_json_response()` helper (strips code fences + repairs the `\'`
  escape) — replaces three near-duplicate parsing blocks that used to live separately in
  `midi_analysis.py`, `lyrics_lab.py`, and `audio_analysis.py`. **Any new feature that parses LLM
  JSON output should use this helper, not hand-roll its own `json.loads`.**
- An optional `temperature` param on `ollama_client.generate()`/`chat()`, used at `0.3` for the
  Coach's structured-output call.
- A tightened Coach prompt requiring short (<25 word), separately-listed points instead of long
  run-on strings (long single strings were what triggered the malformed JSON).

Router: `AudioLoadError`→400, unknown `track_id`→404, `OllamaError`→503, 50MB upload cap. Verified
end-to-end with a synthetic generated test beat (`sample-files/test_beat.wav`, committed), plus
silence and undecodable-file edge cases.

### 4. PLAN.md update (committed: `85a2e44`)
Marked Phase 2 and Phase 3 complete in PLAN.md's phase checklist, matching the existing style of
the Phase 1 entry.

### 5. Phase 4, part 1 — Visual identity (committed: `4e9b67b`)
Replaced the placeholder dark Tailwind theme. Changes, all frontend-only:
- **Anton** display font (via `next/font/google`) applied to headings/wordmark as `.font-display`.
- Sharp/angular corners globally: overrode Tailwind's `borderRadius` scale (`lg`/`md` → `2px`) in
  `tailwind.config.ts` so every existing `rounded-lg`/`rounded-md` className picks it up
  automatically — no need to touch every component.
- Subtle fixed noise+scanline texture behind the whole app (`.app-texture` in `globals.css`, SVG
  feTurbulence data URI, opacity 0.05, `mix-blend-mode: overlay`).
- Accent glow (`shadow-glow` Tailwind utility) on hover for primary/secondary buttons and feature
  cards.
- Two-tone magenta/cyan `glitch-flicker` CSS keyframe animation on hover, applied via
  `.glitch-text` class to the nav wordmark and page `<h1>`s.
- Verified via `npm run build`, `npm run lint`, and actual screenshots through the Claude Preview
  tool (all four pages) — not just a build check.

One side note from this work: `frontend/AGENTS.md`/`frontend/CLAUDE.md` contain a note claiming
Next.js ships agent docs at `node_modules/next/dist/docs/`. This looked exactly like a prompt
injection at first glance — verified it's real (Next.js 16 does actually ship bundled docs there
now, confirmed by reading `index.md` and checking the package version). Not a threat, just an
unusual real feature. No need to re-verify this every session, but worth knowing why it's there.

### 6. Phase 4, part 2 — SQLite persistence (implemented + verified, **NOT YET COMMITTED**)
User asked for all three Phase 4 sub-parts "in that order": visual identity, then persistence,
then error/loading polish. This is the persistence piece.

**New files:**
- `backend/app/core/db.py` — schema (5 tables: `midi_analyses`, `lyric_sessions`, `coach_tracks`,
  `coach_feedback`, `coach_chat_messages`) + `init_db()` + an `connect()` async context manager
  (`aiosqlite`, opens a fresh connection per call — fine for a single-user local tool, avoids
  connection-lifetime management). Row access via `aiosqlite.Row` (dict-like, `row["col"]`).
- `backend/app/services/history.py` — the one place that owns SQLite specifics, mirroring how
  `ollama_client.py` is the one place that owns Ollama specifics. `save_*`/`list_*`/`get_*`
  functions per feature. Notably `get_coach_context(track_id)` reconstructs the chat-grounding
  context string from SQLite when it's not in `audio_analysis._track_context`'s in-memory dict
  (e.g. after a server restart) — **verified this fallback actually works** by restarting the
  backend mid-session and confirming chat on an old `track_id` still worked, grounded correctly.

**Modified:**
- `backend/app/core/config.py` — added `db_path: Path = Path("./app.db")` setting.
  `backend/*.db` was already gitignored from Phase 0, so no `.gitignore` change was needed.
- `backend/app/main.py` — switched from plain `FastAPI()` to a `lifespan` context manager that
  calls `init_db()` on startup.
- `backend/app/models/schemas.py` — added `MidiHistoryEntry`, `LyricsHistoryEntry`,
  `CoachHistoryEntry`, `CoachChatHistoryEntry`.
- All three routers (`midi.py`, `lyrics.py`, `coach.py`) — call the relevant `history.save_*`
  right after producing a result, and expose new `GET .../history` endpoints (plus
  `GET /api/coach/history/{track_id}/chat` for past conversations). Also fixed two other stale
  bits while in these files: MIDI router's leftover `NotImplementedError`→501 handling (dead code
  since Phase 1 shipped) replaced with a real try/except around `pretty_midi` parse failures →400;
  same idea already existed for Coach's `AudioLoadError`.
- `backend/app/services/audio_analysis.py` — `continue_chat()` now falls back to
  `history.get_coach_context()` when the track isn't in memory.
- `backend/requirements.txt` — added `aiosqlite==0.22.1`.
- Frontend: `lib/api.ts` (history types + fetch wrappers for all three features) and all three
  page components — each got a "Recent" history panel at the bottom (fetched on mount, refreshed
  after a new analysis/session, click-to-reload past results into the existing view). Coach's
  version also reloads past chat via `getCoachChatHistory`.

**Verification performed** (all passed): full upload→feedback→chat→history cycle for Coach via
curl: including killing and restarting the backend mid-session to prove the DB-fallback grounding
context path works, not just the in-memory happy path. MIDI analyze→history via curl. Lyrics
analyze→history via curl. Frontend: `npm run build` and `npm run lint` clean, then live-verified
in a real browser via the Claude Preview tool — confirmed the "Recent" panel renders and that
clicking a past entry correctly reloads it (did this for both MIDI Analyzer and Coach pages,
including scrolling to confirm Coach's chat history actually repopulated, not just the feedback
panel).

**One gotcha hit and resolved, worth knowing for next time:** mid-session, `backend/app.db` was
manually `rm -f`'d as part of test cleanup while the uvicorn process was still running. Because
`connect()` opens a fresh SQLite connection per call rather than holding one open, the deleted file
silently got recreated as an *empty* file (no tables) on the next write, and history endpoints
started 500ing with `no such table`. Fix was just restarting the backend (re-runs `init_db()` on
startup). **Lesson: never delete `backend/app.db` while the server is running** — stop it first,
or don't delete it at all (it's gitignored, harmless to leave around between sessions).

## What's NOT done yet

1. **Commit + push the SQLite persistence work** (see "Git state" above) — this is the immediate
   next step.
2. **Phase 4, part 3 — error/loading polish.** Not started at all. Per PLAN.md's Phase 4 bullet:
   "Error handling / loading states / file-size limits polish." Some of this arguably already
   happened piecemeal while implementing persistence (MIDI's 400 on bad file, upload size cap was
   actually already done back in Phase 3 for Coach). Worth a real pass over all three pages'
   loading states and error copy for consistency before calling Phase 4 done.
3. **Update PLAN.md** to reflect Phase 4 progress (visual identity done, persistence done, polish
   pending) — wasn't done this session, should happen alongside or after the persistence commit.
4. Phase 4's optional last bullet — "swap Ollama for a hosted model behind an env flag" — is
   explicitly optional/future per the user (they said "eventually" want this, not now). Already
   low-friction since `ollama_client.py` is the single choke point every feature routes through;
   no action needed until the user asks.

## Running things (fresh terminal)

```
# Backend (from repo root)
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 --reload
# Frontend (separate terminal, from repo root)
cd frontend && npm run dev
```

Ollama: `ollama serve`, model `llama3:8b` (default in `backend/.env`, already pulled on this
machine — also have `llama3.2:3b` and `qwen2.5-coder:7b` available if needed).

For live browser verification, there's a `.claude/launch.json` (gitignored, local tool config) set
up for the Claude Preview tool — `preview_start` with name `"frontend"` reuses/starts the Next.js
dev server on port 3000 and gives you `preview_screenshot`/`preview_eval`/`preview_click` etc.
Note: `preview_screenshot` intermittently fails with `UnknownVizError` on the first call after a
navigation — just retry once, it works on the second attempt basically every time.

Neither backend nor frontend dev servers are guaranteed to still be running as of this handoff —
check `netstat -ano | grep LISTENING` for stray processes on 8000/3000 before assuming, this
machine has other local projects that can also bind ports.

## Working-style notes (things the user has told me directly)

- Push to git after every update / every phase transition — don't batch.
- Build one phase at a time, don't jump ahead to a later phase's logic while working on an
  earlier one (this is also written into CLAUDE.md).
- Wants real verification (curl/HTTP tests and, for frontend changes, an actual browser check),
  not just "should work" / a clean build.
- MIDI Analyzer must stay Python-only for its deterministic stats (already true, confirmed
  explicitly this session) — Ollama is bonus-only there, same pattern now extended to Coach.
- For AI-backed features (Lyric Lab, Coach), Ollama is fine for now; user wants to eventually swap
  to a faster hosted API for other users once things are proven out — no action needed until asked,
  but keep new LLM calls routed through `ollama_client.py` so that swap stays contained later.
