# Project Handoff

Written because the prior session's context window hit ~98%. This is the single document to read
to pick this project back up cold. No code changes were made as part of writing this file.

## Purpose

AI Music Assistant — three features for producers in the rage/plugg lane (style references: Ken
Carson, Playboi Carti, OsamaSon, Draco FM). Goal: lower the barrier for bedroom producers to get
mentor-quality feedback/analysis, with zero required cost or account (local-first, local LLM).

1. **AI Coach** (Phase 3, not started) — upload a beat/melody/drum loop, get structured feedback,
   then chat follow-ups.
2. **MIDI Analyzer** (Phase 1, **done**) — upload `.mid`, get BPM/key/density/etc. (always) plus
   an optional AI feel/mood read (if Ollama is running).
3. **Lyric Lab** (Phase 2, **not started — next up**) — paste lyrics, get critique or generated
   candidate lines matching the existing flow.

Full narrative docs (all still accurate, read these for detail this file compresses):
[README.md](README.md), [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[CLAUDE.md](CLAUDE.md), and per-feature specs in `docs/FEATURE_*.md`.

## Stack

- Frontend: Next.js 16.3.0 (App Router) + TypeScript + Tailwind, in `frontend/`
- Backend: FastAPI (Python 3.13) in `backend/`, venv at `backend/.venv`
- LLM: local Ollama, **optional** (see "Key design decision" below). Models available on this
  machine: `llama3:8b` (default, configured in `backend/.env`), `llama3.2:3b`, `qwen2.5-coder:7b`.
- MIDI: `pretty_midi`. Audio (Phase 3, unused so far): `librosa`/`soundfile`.

## Repo layout (everything that exists right now)

```
MUSIC ASSISTANT/
├── README.md, PLAN.md, ARCHITECTURE.md, CLAUDE.md, HANDOFF.md (this file)
├── .gitignore                    (repo is NOT git-initialized yet — plain folder)
├── docs/
│   ├── FEATURE_MIDI_ANALYZER.md  (updated to reflect Ollama-optional design)
│   ├── FEATURE_LYRICS.md         (spec only, not yet implemented)
│   └── FEATURE_COACH.md          (spec only, not yet implemented)
├── sample-files/
│   └── test_melody.mid           (synthetic test file: A-minor sparse melody, 142 BPM)
├── backend/
│   ├── .venv/                    (Python venv, deps installed)
│   ├── .env                      (copied from .env.example, OLLAMA_MODEL=llama3:8b)
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               FastAPI app, CORS, router registration
│   │   ├── core/config.py        Settings (env vars)
│   │   ├── models/schemas.py     All request/response models
│   │   ├── routers/
│   │   │   ├── midi.py           POST /api/midi/analyze — IMPLEMENTED
│   │   │   ├── lyrics.py         /analyze, /generate — routes exist, service raises 501
│   │   │   └── coach.py          /upload, /feedback, /chat — routes exist, service raises 501
│   │   └── services/
│   │       ├── ollama_client.py  Functional Ollama wrapper (chat/generate), used by midi_analysis
│   │       ├── midi_analysis.py  IMPLEMENTED (Phase 1) — see below
│   │       ├── lyrics_lab.py     Stub, raises NotImplementedError (Phase 2 — next)
│   │       └── audio_analysis.py Stub, raises NotImplementedError (Phase 3)
│   └── uploads/                  gitignored, has some test files from manual testing
└── frontend/
    ├── package.json              Next 16.3.0, React 18.3.1, eslint 9 flat config
    ├── eslint.config.mjs         Flat config (Next 16 removed `next lint` CLI command)
    ├── app/
    │   ├── layout.tsx, page.tsx  Landing page linking to all 3 features
    │   ├── midi-analyzer/page.tsx  IMPLEMENTED, wired to backend, shows ai_available fallback UI
    │   ├── lyrics/page.tsx       UI shell wired to backend, will show 501 error until Phase 2
    │   └── coach/page.tsx        UI shell wired to backend, will show 501 error until Phase 3
    ├── components/ (NavBar, FeatureCard)
    └── lib/api.ts                 All backend fetch wrappers + shared TS types
```

## Completed work (Phase 1 — MIDI Analyzer)

Fully implemented and tested end-to-end (service function, live HTTP endpoint via curl, and the
built/served Next.js page):

- `backend/app/services/midi_analysis.py`: parses `.mid` with `pretty_midi`, extracts BPM (prefers
  the file's actual tempo meta-event over `estimate_tempo()`'s onset-heuristic, which was wrong
  for sparse clips — this was a real bug found and fixed during testing), time signature, key
  (Krumhansl-Schmuckler correlation over a duration-weighted pitch-class histogram, drum tracks
  excluded), note density, pitch range, avg velocity, track count.
- Optionally calls Ollama for a `feel_summary`/`notes`/`suggestions` narrative on top of the
  deterministic stats (JSON-formatted prompt/response).
- Frontend page renders all of this, including a distinct "install Ollama" hint state.

## Key design decision made this session (IMPORTANT, in progress verifying)

**User explicitly requested: MIDI analysis must work with Python packages alone; Ollama is
optional, only unlocked if the user has it installed/running.** This was NOT the original design
(original design always called Ollama). Changes made in response, all applied:

1. `MidiAnalysisResponse` schema (`backend/app/models/schemas.py`) gained an `ai_available: bool`
   field. When Ollama is unreachable, `feel_summary`/`notes` are empty strings and `suggestions`
   is `[]`, but all deterministic fields are still fully populated.
2. `midi_analysis.py`'s `_interpret_features()` now catches `ollama_client.OllamaError` (raised on
   connection failure) and returns `ai_available=False` instead of propagating the error. A
   separate case — Ollama reachable but returns unparseable JSON — still sets `ai_available=True`
   (Ollama IS available, it just misbehaved), distinct from "not available at all".
3. `frontend/lib/api.ts` type and `frontend/app/midi-analyzer/page.tsx` updated: page now branches
   on `ai_available` to either show the Feel/Notes/Suggestions panels or a dashed-border hint box
   ("stats above are computed locally... install Ollama to unlock AI feedback").
4. `docs/FEATURE_MIDI_ANALYZER.md` and `CLAUDE.md` (Conventions section) updated to document this
   as a standing project principle: **apply this same optional-AI pattern to Phase 3 (AI Coach) —
   librosa feature extraction should work standalone, only narrative feedback needs Ollama.**
   Explicitly does NOT apply to Lyric Lab — critique/generation has no non-AI equivalent, Ollama is
   required there by nature of the feature.

**Verification status: both paths confirmed working, no outstanding verification needed.**
- ✅ Confirmed via HTTP: with Ollama reachable, response has `ai_available: true` and real
  `feel_summary`/`notes`/`suggestions` content (tested against `sample-files/test_melody.mid`).
- ✅ Confirmed via direct service call (Ollama simulated unreachable by pointing
  `settings.ollama_host` at `http://localhost:1`): response correctly returns `ai_available: false`
  with `feel_summary`/`notes` empty and `suggestions: []`, while all deterministic fields remained
  fully correct (`bpm: 142.0`, `time_signature: "4/4"`, `key: "A minor"`, `note_density: 1.3`,
  `pitch_range: ["A3", "E4"]`, `avg_velocity: 85`, `track_count: 1`). The Ollama-optional design is
  fully implemented and verified — no remaining work on this item.

## Other bugs found and fixed this session (background/tooling, not features)

- `numpy==1.26.4` had no Windows/Python 3.13 wheel → relaxed to `numpy>=1.26` in
  `backend/requirements.txt` (same relaxation applied to librosa/soundfile).
- `pretty_midi` imports `pkg_resources` at runtime → pinned `setuptools<81` (newer setuptools
  dropped it).
- `next@14.2.13` had a critical security vulnerability (and ~30 other advisories) → upgraded to
  `next@16.3.0` (current stable). This required: bumping `eslint` to v9, replacing
  `.eslintrc.json` with flat-config `eslint.config.mjs`, and changing the `lint` script from
  `next lint` (removed in Next 16) to `eslint .`. React stayed at 18.3.1 (satisfies Next 16's peer
  range, no bump needed). `npm run build` confirmed working after the upgrade.
- Default `OLLAMA_MODEL` changed from `llama3.1` (not pulled on this machine) to `llama3:8b`
  (already pulled) in both `backend/.env.example` and `backend/app/core/config.py`.
- A stale/orphaned process from an unrelated old project (`python -m backend.app`, using system
  Python, an old Flask "music maker" script the user had built previously — nothing to do with
  this repo) was found squatting on port 5000 and confusing the user's browser testing. Killed.
  Also cleaned up a duplicate idle `uvicorn` process. **Lesson for next session:** if the user
  reports seeing unexpected/old content in the browser, check `netstat -ano` for stray processes
  before assuming it's a code bug — this machine has other local projects that can collide on
  ports or (in principle) module names.

## Currently running (as of context handoff)

- Backend: `uvicorn app.main:app --port 8000`, running via `nohup` in the background, confirmed
  healthy (`curl http://localhost:8000/health` → `{"status":"ok"}`).
- Frontend: `npm run dev`, running via `nohup` in the background, confirmed serving (200 on
  `http://localhost:3000`).
- Both were started from `backend/` and `frontend/` respectively with `nohup ... & disown`. A
  fresh session has no memory of their process IDs — use `netstat -ano | grep LISTENING` to find
  them if they need restarting (e.g. after further code edits, since neither is running with
  `--reload`).

## Remaining work

Phase 1 (MIDI Analyzer) is fully done and verified — nothing outstanding on it.

1. **Phase 2 — Lyric Lab** (next phase, not started — this is where the next session should pick
   up): implement `backend/app/services/lyrics_lab.py` (`analyze_lyrics`, `generate_lines`) per
   `docs/FEATURE_LYRICS.md`. Both functions currently raise `NotImplementedError`. Routers and
   frontend page already exist and are wired — only the service logic is missing. Ollama is
   required for this feature (no optional-AI pattern here).
2. **Phase 3 — AI Coach** (not started): implement `backend/app/services/audio_analysis.py` per
   `docs/FEATURE_COACH.md`. Remember to apply the Ollama-optional pattern to feature extraction
   (librosa parts standalone) per the convention documented in `CLAUDE.md`.
3. **Phase 4 — Polish** (not started): real visual identity (currently placeholder dark Tailwind
   theme), persisted history via SQLite, error/loading-state polish.
4. Housekeeping not yet done: repo is not git-initialized; `backend/uploads/` has a few leftover
   test files from manual testing (harmless, gitignored anyway); `backend/uvicorn.log` and
   `frontend/nextdev.log` are stray log files from nohup runs (not gitignored — worth adding to
   `.gitignore` at some point, low priority).

## How to run things (fresh terminal, e.g. a new Claude Code session)

```bash
# Backend (from repo root)
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 --reload

# Frontend (separate terminal, from repo root)
cd frontend && npm run dev
```

Ollama (optional but needed for AI-enhanced MIDI feedback and required for Phase 2/3 once built):
`ollama serve`, then `ollama pull llama3:8b` if not already pulled (`ollama list` to check).

## Notes on working style established this session

- User wants scaffolding done in phases, not all at once — do not jump ahead to a later phase's
  logic while working on an earlier one.
- User is hands-on and wants real verification (curl/HTTP tests, not just "should work") before
  considering a phase done.
- When ambiguous requests come in (e.g. the port-5000 confusion), it's worth diagnosing with
  read-only commands before guessing — this repo coexists on the same machine as other unrelated
  projects (`~/ai-music`, standalone HTML files in Downloads) that have caused confusion before.
