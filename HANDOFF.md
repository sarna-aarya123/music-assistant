# Handoff

## Purpose

Local-first music assistant, no account, no cloud API key. Three independent features, **all fully
deterministic Python right now — no AI/LLM is wired up to any route**. Ollama integration exists in
the codebase but is intentionally disconnected (see "AI is currently disconnected, not deleted"
below); it's meant to be reconnected as a later layer on top, not the thing the app depends on today.

## Current working features

1. **MIDI Analyzer** — upload a `.mid`/`.midi` file, get BPM, time signature, key, note density,
   pitch range, avg velocity, track count, unique pitch classes, velocity range, avg note length,
   polyphony (max simultaneous notes), syncopation (off-beat onset fraction) — all `pretty_midi`.
   `feel_summary`/`notes`/`suggestions` are a rule-based read on those numbers (plain Python
   thresholds in `_describe_features()`), always populated, no model call.
2. **Lyric Lab** — paste lyrics, get critique only (line generation is disconnected — see below).
   Real phonetic rhyme-scheme detection, syllable counting, and cadence-consistency analysis via
   the CMU Pronouncing Dictionary (`pronouncing`/`cmudict` packages), with a grapheme-based
   heuristic fallback for slang/OOV words. Repetition analysis distinguishes intentional hook
   repetition (a line repeated verbatim) from word-level overuse.
3. **AI Coach** — upload an audio file (`.wav/.mp3/.m4a/.flac/.aiff`), get BPM, key, RMS loudness,
   spectral brightness/rolloff, zero-crossing rate, dynamic range (crest factor), low-end energy
   ratio, onset density — all `librosa`. `strengths`/`improvements` are a rule-based read on those
   numbers, always populated. Follow-up chat is disconnected (see below).

All three persist history to SQLite, browsable via a "Recent" panel on each page (click to reload
a past result). Visual identity is "Crystal Arcade" — bright glossy JRPG-menu look (see the
Frontend section below for details).

## AI is currently disconnected, not deleted

Per explicit user instruction: strip AI/Ollama out of every active code path and UI surface, but
keep the underlying integration code in the repo (not git-deleted) so a future AI layer doesn't
require rebuilding from scratch. Concretely:

- `app/services/ollama_client.py` (the Ollama HTTP client) is untouched and still fully functional
  — nothing currently calls it from an active route.
- `lyrics_lab.generate_lines()` (AI line generation) and `audio_analysis.continue_chat()` +
  `_track_context` (AI chat) are still defined and still work, they're just not wired to any
  router endpoint. `history.append_coach_chat_messages()` / `get_coach_chat_history()` /
  `get_coach_context()` are the same story on the persistence side.
- `app/routers/system.py` (`GET /api/system/ollama-installed`) still works standalone but is not
  registered in `app/main.py` — see the comment there.
- Schemas for the disconnected features (`ChatMessage`, `CoachChatRequest/Response`,
  `LyricsGenerateRequest/Response`) are still defined in `models/schemas.py`, just unused by any
  router.
- DB columns that only ever supported the AI path (`ai_available`, `follow_up_questions_json` on
  `coach_feedback`; `ai_available` on `midi_analyses`) are still in the SQLite schema — SQLite
  can't cheaply drop columns, so `history.py` just writes constant placeholder values into them
  now rather than migrating them away. Existing local history rows load fine unchanged.
- To reconnect any of this later: add a router endpoint that calls the relevant kept-but-unused
  service function, and rebuild whatever frontend UI called it before (see git history for the
  previous `UseAiToggle`/chat-box/Generate-Lines UI, since removed).

## Architecture

- **Backend**: FastAPI (`backend/app/`), routers thin (validate → call service → shape response),
  logic lives in `backend/app/services/*.py`.
  - `routers/{midi,lyrics,coach}.py` — one per active feature, prefixed `/api/{midi,lyrics,coach}`.
    `routers/system.py` exists but isn't registered in `main.py` (see "AI is currently disconnected"
    above).
  - `services/midi_analysis.py` — `pretty_midi` feature extraction (bpm/key/time signature/density/
    pitch range/velocity/track count, plus depth: `unique_pitch_classes`, `velocity_range`,
    `avg_note_length_sec`, `polyphony` via a sweep-line overlap count, `syncopation` via 16th-note
    grid quantization) and `_describe_features()`, a plain-threshold rule-based text generator for
    `feel_summary`/`notes`/`suggestions` — no model call anywhere in this file.
  - `services/audio_analysis.py` — `librosa` feature extraction (bpm/key/rms_db/brightness_hz, plus
    depth: `rolloff_hz`, `zero_crossing_rate`, `dynamic_range_db` (crest factor), `low_end_ratio`
    (energy below 150Hz), `onset_density`) and `_describe_features()`, same rule-based-text pattern
    as MIDI, for `strengths`/`improvements`. `continue_chat()`/`_track_context` are kept but
    disconnected (see above).
  - `services/lyrics_lab.py` — `analyze_lyrics()` (sync, no `await` — no I/O) does real phonetic
    rhyme-scheme detection (`rhyme_key()`: CMU dict via `pronouncing.rhyming_part()`, falling back
    to `_heuristic_rhyme_key()` — grapheme-based, from the last vowel group to end-of-word, with a
    "-y → -i" normalization since English "-y" endings usually sound like "-ee") and syllable
    counting (`syllable_count()`: CMU dict via `pronouncing.syllable_count()`, falling back to
    `_heuristic_syllables()` — vowel-group counting with a silent-e correction). Rhyme scheme is
    labeled A/B/C... by first-seen key match; pattern detection compares couplet-rate (line rhymes
    next line) vs alternating-rate (line rhymes two lines back) to guess AABB vs ABAB vs no pattern,
    and flags lines that break the dominant pattern. Cadence flags lines whose syllable count
    deviates > 1.3×stdev (min 2) from the mean. Repetition separates hook lines (any line repeated
    ≥2x verbatim) from word-level overuse (any non-stopword used ≥4x outside a hook line).
    `generate_lines()` (AI line generation) is kept but disconnected.
  - `services/ollama_client.py` — untouched, kept but disconnected (see above).
  - `services/history.py` — owns all SQLite specifics (`save_*`/`list_*`/`get_*` per feature).
    Writes constant placeholder values into now-vestigial AI-only columns (see above) rather than
    migrating them away.
  - `core/db.py` — schema (5 tables) + `init_db()` (called from `main.py` lifespan) + an
    `aiosqlite` `connect()` context manager (fresh connection per call). New columns added since
    the initial release go through `_NEW_COLUMNS` + a defensive `ALTER TABLE ADD COLUMN` loop that
    swallows "duplicate column name" errors — the lightweight migration approach for a single-file
    local SQLite db with no concurrent writers. Existing local history data was **not** wiped for
    this change.
  - `core/config.py` — `pydantic-settings`, reads `backend/.env` (`OLLAMA_HOST`, `OLLAMA_MODEL` —
    still read even though nothing currently uses them; `UPLOAD_DIR`, `CORS_ORIGINS`; `db_path`
    defaults to `./app.db`).
  - `models/schemas.py` — all request/response Pydantic models. `TrackFeatures`'s new depth fields
    default to `0.0` so history rows saved before they existed still deserialize.
  - No auth. Uploads go to `backend/uploads/` (gitignored).
- **Frontend**: Next.js App Router + TypeScript + Tailwind (`frontend/`).
  - One page per feature (`app/{coach,lyrics,midi-analyzer}/page.tsx`): upload/input form → stat
    panels → results (always rendered, no AI-gating) → "Recent" history panel. Pages never call
    `fetch()` directly — everything routes through `lib/api.ts`. No AI toggle, no chat UI, no
    Generate-Lines UI anywhere — `components/UseAiToggle.tsx` was deleted (nothing imports it).
  - `lib/api.ts` — typed fetch wrappers, one per active endpoint only (no `getOllamaInstalled`,
    `sendChatMessage`, `generateLyrics`, `getCoachChatHistory` — all removed since their backend
    routes are disconnected). `analyzeMidi(file)` / `getFeedback(trackId)` / `analyzeLyrics(lyrics)`
    take no AI-related params anymore. `TrackFeatures`/`MidiAnalysisResponse` types include all the
    new depth fields. Every call goes through `safeFetch()` (network failure → readable `ApiError`).
    Upload size caps enforced client-side before any request (MIDI 10MB, Coach 50MB).
  - `lib/useCountUp.ts` — `requestAnimationFrame`-based hook animating a number from 0 to a
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

- **Every feature is 100% deterministic Python right now — no AI call happens on any active code
  path.** This was an explicit, deliberate reversal of the earlier "AI is opt-in via a toggle"
  design: AI isn't opt-in anymore, it's fully disconnected. See "AI is currently disconnected, not
  deleted" above for exactly what was kept vs. what was removed from the UI/routes.
- **Deterministic-vs-LLM split is still the rule for when AI comes back** (see `CLAUDE.md`): a
  numeric fact (BPM, key, duration, loudness) must never come only from an LLM call. This mattered
  less when AI was disconnected but stays the constraint to design around when reconnecting it.
- Rhyme/syllable analysis depends on the `pronouncing`/`cmudict` PyPI packages (pure Python, CMU
  dict bundled locally, no network call at runtime) — added to `requirements.txt`. Words not in the
  CMU dict (slang, made-up words) fall back to grapheme-based heuristics in `lyrics_lab.py`, which
  are less accurate than real phonetic matching.
- Upload size caps: Coach 50MB, MIDI 10MB — enforced both server-side and client-side.
- `backend/app.db` (SQLite) is gitignored. Don't delete it while the server is running (recreates
  an empty DB with no tables, causing 500s). Stop the server first. This change specifically avoided
  needing to delete/migrate it — see `core/db.py`'s `_NEW_COLUMNS` approach above.
- No new npm dependencies on the frontend side for this change (only `lib/api.ts` types/functions
  changed). Backend gained `pronouncing`+`cmudict` (see `requirements.txt`).

## Known bugs/issues

- No automated test suite exists for either backend or frontend — verification is manual (curl +
  live browser checks via the Claude Preview tool).
- The heuristic rhyme-key fallback (for words outside the CMU dict) is grapheme-based and will
  sometimes fail to match words that a CMU-dict word would correctly rhyme with, since it can't
  reason about pronunciation the way the dictionary lookup can — documented as a known limitation
  in `lyrics_lab.py`'s docstrings rather than solved.
- `syncopation` in the MIDI Analyzer is a simplified proxy (16th-note grid quantization, on-beat
  vs off-beat) — it doesn't weight by metric accent the way a music-theory-grade syncopation score
  would, and can read high on synthetic/quantized-oddly test files. Documented as a simplification
  in `midi_analysis.py`'s docstring.

## Next task

Nothing is currently blocking or in progress. The most recently requested change — removing all
Ollama/AI integration from active use and replacing it with deeper deterministic Python analysis
across all three features (MIDI Analyzer, AI Coach, Lyric Lab) — is complete, verified end-to-end
(direct API calls with real files + live browser click-through), committed, and pushed to `main`.
No next task has been defined yet — check with the user for what's next.
