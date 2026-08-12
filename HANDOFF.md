# Handoff

## Purpose

Local-first AI assistant for producers in the rage/plugg lane (Ken Carson, Playboi Carti,
OsamaSon, Draco FM as style references). Three independent features, no account, no cloud API key.
Deterministic analysis (BPM/key/loudness/etc.) always runs in pure Python; Ollama AI narrative
feedback is optional and strictly opt-in via a UI toggle, not attempted automatically.

## Current working features

1. **MIDI Analyzer** — upload a `.mid`/`.midi` file, get BPM, time signature, key, note density,
   pitch range, avg velocity, track count (deterministic, `pretty_midi`). AI feel/mood summary +
   suggestions only run if the user toggles AI on and Ollama is installed.
2. **Lyric Lab** — paste lyrics, get critique (rhyme/repetition/cadence/imagery, line-by-line) or
   generate N candidate lines. Pure LLM feature (no deterministic mode) — the "Use Ollama AI Coach"
   toggle gates whether the analyze/generate actions are even clickable.
3. **AI Coach** — upload an audio file (`.wav/.mp3/.m4a/.flac/.aiff`), get deterministic features
   (BPM, key, RMS loudness, spectral brightness via `librosa`). AI strengths/improvements/
   follow-up questions + multi-turn chat only run if AI is toggled on.

All three persist history to SQLite, browsable via a "Recent" panel on each page (click to reload
a past result). Visual identity is a cyberpunk/HUD look: angular corner-bracket panels, animated
cyan grid overlay, monospace terminal font for readouts, neon glow/status colors, scanline hover
sweep, animated count-up stat reveals.

## Architecture

- **Backend**: FastAPI (`backend/app/`), routers thin (validate → call service → shape response),
  logic lives in `backend/app/services/*.py`.
  - `routers/{midi,lyrics,coach,system}.py` — one per feature, prefixed `/api/{midi,lyrics,coach,
    system}`. `system.py` is new: `GET /api/system/ollama-installed`.
  - `services/midi_analysis.py`, `services/audio_analysis.py`, `services/lyrics_lab.py` — feature
    logic. MIDI and Coach split deterministic feature extraction (always runs) from an LLM
    narrative layer, now gated behind a `use_ai: bool = False` parameter on `analyze_midi()` /
    `generate_feedback()` — when `False`, `_interpret_features()` is skipped entirely and
    `ai_available` is `False` without any Ollama call being attempted. Lyric Lab has no
    deterministic mode (`OllamaError`→503, unparseable-output `LyricsLLMError`→502 propagate to
    the router) — the frontend toggle gates whether its endpoints get called at all.
  - `services/ollama_client.py` — the only place that talks to Ollama's HTTP API
    (`chat()`/`generate()`) and owns `parse_json_response()` (strips markdown fences, repairs a
    `\'` escape bug `llama3:8b` emits). Also owns `is_installed()` — a synchronous, stdlib-only
    check (`shutil.which("ollama")`) for whether the CLI is on PATH; no network call, doesn't
    indicate whether `ollama serve` is running.
  - `services/history.py` — owns all SQLite specifics (`save_*`/`list_*`/`get_*` per feature).
  - `core/db.py` — schema (5 tables) + `init_db()` (called from `main.py` lifespan) + an
    `aiosqlite` `connect()` context manager (fresh connection per call).
  - `core/config.py` — `pydantic-settings`, reads `backend/.env` (`OLLAMA_HOST`, `OLLAMA_MODEL`,
    `UPLOAD_DIR`, `CORS_ORIGINS`; `db_path` defaults to `./app.db`).
  - `models/schemas.py` — all request/response Pydantic models. New: `OllamaAvailabilityResponse
    {installed: bool}`; `CoachFeedbackRequest` gained `use_ai: bool = False`.
  - No auth. Uploads go to `backend/uploads/` (gitignored); Coach's in-memory `_track_context`
    dict is the fast path for chat grounding, with `history.get_coach_context()` as a SQLite
    fallback after a restart.
- **Frontend**: Next.js App Router + TypeScript + Tailwind (`frontend/`).
  - One page per feature (`app/{coach,lyrics,midi-analyzer}/page.tsx`): upload/input form → HUD
    stat panels → AI sections (gated on the toggle + `ai_available`) → "Recent" history panel.
    Pages never call `fetch()` directly — everything routes through `lib/api.ts`.
  - `lib/api.ts` — typed fetch wrappers. `getOllamaInstalled()` is new. `analyzeMidi(file, useAi)`
    and `getFeedback(trackId, useAi)` now take a `useAi` argument sent to the backend as
    `use_ai`. Every call goes through `safeFetch()` (network failure → readable `ApiError`).
    Upload size caps enforced client-side before any request (MIDI 10MB, Coach 50MB).
  - `components/UseAiToggle.tsx` — new. Self-contained: fetches `getOllamaInstalled()` on mount,
    renders a controlled toggle button (`checked`/`onChange` props) that's disabled with a tooltip
    if Ollama isn't found. Used on all three feature pages; on Lyric Lab it also gates whether
    Analyze/Generate are clickable at all (no deterministic fallback exists there).
  - `lib/useCountUp.ts` — new. `requestAnimationFrame`-based hook animating a number from 0 to a
    target value (~600ms, cubic ease-out); used by each page's `Stat` helper for numeric readouts.
  - Visual identity: **"Crystal Arcade"** — bright glossy JRPG-menu look, replacing the earlier
    dark cyberpunk/HUD theme. Anton (`--font-display`) + JetBrains Mono (`--font-mono`) via
    `next/font/google`, both loaded in `app/layout.tsx`. `tailwind.config.ts` now defines a
    pastel/candy palette (`background`/`surface`/`border`/`ink`/`accent`/`accent2`/`gold`/`muted`/
    `success`/`warning`), large rounded radii, glossy `shadow-glow*`/`shadow-glass` tokens, and
    motion keyframes (`gradient-drift`, `float-y`, `pop-in`, `blink`, `tail-sway`, `twinkle`, `bob`).
    `globals.css` keeps the *same class names* the old theme used (`.hud-panel`, `.hud-grid`,
    `.hud-scan-surface`, `.app-texture`, `.glitch-text`, `.status-dot`) but redefines them as glass/
    glossy — this is why every page picked up the new look with almost no per-page edits: `.hud-panel`
    is now a blurred glass card with a gloss-sheen `::before`, an iridescent gradient-border `::after`,
    hover-lift, and a `pop-in` mount animation; `.glitch-text` is now a shimmering gradient-text
    sweep; `body` has an animated drifting pastel gradient. Also added plain-CSS overrides for the
    raw Tailwind utility classes still used directly (`.border-border` → rounded + soft border color,
    `.bg-surface` → translucent glass, `.bg-accent`/`.border-accent` → pill radius + gloss + press
    animation) so inputs/buttons that don't use `.hud-panel` reskin for free too.
  - `components/Mascot.tsx` — an original hand-drawn SVG chibi "crystal fox spirit" mascot
    (headphones, forehead gem, floating sparkles; no third-party character art) with CSS-driven
    idle float/blink/tail-sway animation. Used in `NavBar` (small) and the homepage hero (large).
  - `components/CrystalField.tsx` — fixed, decorative floating crystal-shard SVGs drifting behind
    page content (`z-0`, `pointer-events: none`), rendered once in `app/layout.tsx`.
  - `NavBar.tsx` is now a floating rounded glass bar (`sticky top-4`, `.hud-panel`) instead of a
    full-width bottom-bordered strip; it wraps (`flex-wrap` + centered on small screens) to avoid
    horizontal overflow on mobile — verified at 375px width.
  - No new npm dependencies — animations are hand-rolled CSS/`requestAnimationFrame`, no icon,
    animation, or illustration library.

## Important technical decisions/constraints

- **Deterministic-vs-LLM split is a hard rule** (see `CLAUDE.md`): a numeric fact (BPM, key,
  duration, loudness) must never come only from an LLM call. MIDI Analyzer and AI Coach always
  compute and display deterministic features regardless of AI state.
- **AI is strictly opt-in now, not auto-attempted.** Previously MIDI/Coach always tried Ollama and
  reported whether it happened to succeed; now the backend only calls Ollama when the caller
  passes `use_ai=true`, which the frontend only does when the user has clicked the toggle (and the
  toggle only allows this when `is_installed()` is true). This applies to MIDI/Coach; Lyric Lab
  has no non-AI mode so the toggle instead gates whether its actions are clickable.
- `ollama_client.is_installed()` only checks PATH — it does not check whether `ollama serve` is
  currently running. That distinction was deliberately dropped (per user feedback) in favor of a
  single simple toggle; a request with `use_ai=true` against an installed-but-not-running Ollama
  still fails with the existing `OllamaError`→503/graceful-degrade paths.
- All new Ollama calls must go through `ollama_client.chat()`/`generate()`; all LLM JSON parsing
  through `parse_json_response()`.
- Upload size caps: Coach 50MB, MIDI 10MB — enforced both server-side and client-side.
- `backend/app.db` (SQLite) is gitignored. Don't delete it while the server is running (recreates
  an empty DB with no tables, causing 500s). Stop the server first.
- No new npm/pip dependencies were introduced for the HUD redesign or the install-check feature —
  `shutil` (stdlib) for detection, hand-written CSS/RAF for animation.

## Known bugs/issues

- **`llama3:8b` occasionally still returns unparseable JSON** despite `parse_json_response()`'s
  repair pass (fences + `\'` fix) — not reproducible on every call with the same input. No further
  mitigation attempted beyond fence-strip + escape-repair.
- No automated test suite exists for either backend or frontend — verification is manual (curl +
  live browser checks via the Claude Preview tool).
- Local Ollama generation (`llama3:8b`, CPU) can take 60–90+ seconds for longer prompts (e.g.
  Lyric Lab analyze); there's no loading-time expectation set in the UI beyond a spinner-less
  "Analyzing..."/"Generating..." button label — a long wait can look stuck without one.
- The `UseAiToggle` re-fetches `is_installed()` independently on every page (each page's toggle
  instance mounts its own check) — harmless (cheap local check) but slightly redundant; could be
  lifted to a shared context if it ever needs to be shown outside per-page toggles (e.g. in
  `NavBar`).

## Next task

Nothing is currently blocking or in progress. The most recently requested change (Crystal Arcade
glossy/JRPG visual redesign, replacing the cyberpunk/HUD theme, with an original mascot) is
complete, committed, and pushed to `main`. No next task has been defined yet — check with the user
for what's next.
