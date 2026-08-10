# Feature: AI Coach (Phase 3)

The most complex feature — build this last, after the prompt style/persona has been proven out in
Phase 2 (Lyric Lab).

## What it does

1. User uploads an audio file (beat, melody loop, drum loop — a rendered/bounced audio file, not
   a project file).
2. System extracts audio features deterministically.
3. Features are turned into structured feedback via the LLM.
4. User can ask follow-up questions in a chat that stays grounded in that track's analysis.

## Input

- Audio file upload: wav/mp3/m4a (multipart). Enforce a reasonable size/duration cap (TBD in
  `PLAN.md` open questions — start with something like 10 minutes / 50MB and revisit).

## Extracted features (deterministic — no LLM)

| Feature                | How                                                                |
|-------------------------|---------------------------------------------------------------------|
| Tempo / BPM              | `librosa.beat.beat_track`                                          |
| Key estimate             | Chroma features + key-profile correlation                          |
| Loudness / RMS            | `librosa.feature.rms`                                              |
| Spectral centroid (brightness) | `librosa.feature.spectral_centroid`                          |
| Rough section/structure  | Onset strength / novelty curve to guess where sections change (intro, drop, etc.) — approximate, don't overclaim precision |
| Stereo width (if stereo)  | Mid/side energy ratio                                              |

Keep this list realistic for a first pass — it's fine to ship with a smaller feature set (tempo,
key, loudness, brightness) and add structure/stereo-width detection once the basics work end to
end.

## Feedback generation

Features → prompt template → structured response:
- **Strengths**: what's working, grounded in specific features where possible ("the low end sits
  well below 100Hz without competing with the kick")
- **Improvements**: 2-4 concrete, actionable points — not "make it better," but "the hats are
  bright enough to mask the melody around 3-6kHz, consider a slight cut"
- **Follow-up questions**: 1-2 questions the AI would ask the producer to give more targeted
  advice (e.g. "is this meant to be a full song or a loop for a placement?") — makes the chat feel
  like a continuation, not a cold start

## Chat

- Maintain conversation history per `track_id` (in-memory is fine for Phase 3; persist in Phase 4)
- Every chat turn should include the track's extracted features + the original feedback as system
  context, so answers stay grounded instead of generic
- If the user asks something the extracted features can't answer (e.g. "does this sound like
  [artist]?"), the model should say so rather than confidently guessing

## Output shapes (see `backend/app/models/schemas.py`)

**Upload** → `{"track_id": "...", "filename": "...", "duration_sec": 42.3}`

**Feedback**
```json
{
  "track_id": "...",
  "features": { "bpm": 140.0, "key": "C minor", "rms_db": -14.2, "brightness_hz": 3200 },
  "strengths": ["..."],
  "improvements": ["..."],
  "follow_up_questions": ["..."]
}
```

**Chat** → request: `{"track_id": "...", "messages": [{"role": "user", "content": "..."}]}`
→ response: `{"reply": "..."}`

## Edge cases to handle when implementing

- Silence/near-silent files
- Mono vs stereo
- Very short clips (a couple seconds) — not enough data for tempo/key confidence
- Non-music audio accidentally uploaded (e.g. a voice memo) — features will just look odd; no need
  for special-case detection in v1, but don't crash
