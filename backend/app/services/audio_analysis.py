"""Audio feature extraction + feedback generation for the AI Coach.

Phase 3 — see PLAN.md and docs/FEATURE_COACH.md for the full spec before implementing.

Planned approach:
  1. Load audio with `librosa`/`soundfile`.
  2. Extract deterministic features (tempo, key, RMS/loudness, spectral centroid, rough section
     structure, stereo width).
  3. Pass features to `app.services.ollama_client.generate(...)` for structured feedback
     (strengths, improvements, follow-up questions).
  4. For chat, include the track's features + prior feedback as context on every turn.
"""

from pathlib import Path

from app.models.schemas import ChatMessage, CoachFeedbackResponse


async def extract_features(file_path: Path) -> dict:
    raise NotImplementedError(
        "Audio feature extraction is not implemented yet — this is Phase 3. See PLAN.md and "
        "docs/FEATURE_COACH.md."
    )


async def generate_feedback(track_id: str, file_path: Path) -> CoachFeedbackResponse:
    raise NotImplementedError(
        "Coach feedback generation is not implemented yet — this is Phase 3. See PLAN.md and "
        "docs/FEATURE_COACH.md."
    )


async def continue_chat(track_id: str, messages: list[ChatMessage]) -> str:
    raise NotImplementedError(
        "Coach chat is not implemented yet — this is Phase 3. See PLAN.md and "
        "docs/FEATURE_COACH.md."
    )
