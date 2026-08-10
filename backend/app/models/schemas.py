"""Shared Pydantic request/response models for all three features.

These define the API contract described in ARCHITECTURE.md. Fields are the target shape for
each phase; they may be trimmed/adjusted as each phase is actually implemented.
"""

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# MIDI Analyzer (Phase 1)
# ---------------------------------------------------------------------------


class MidiAnalysisResponse(BaseModel):
    # Deterministic features — always populated, computed with pretty_midi alone, no LLM involved.
    bpm: float
    time_signature: str
    key: str
    note_density: float
    pitch_range: tuple[str, str]
    avg_velocity: int
    track_count: int

    # AI-enhanced fields — only populated if Ollama is reachable locally. `ai_available` tells the
    # frontend whether to render them or show a "set up Ollama" hint instead.
    ai_available: bool
    feel_summary: str
    notes: str
    suggestions: list[str]


# ---------------------------------------------------------------------------
# Lyric Lab (Phase 2)
# ---------------------------------------------------------------------------


class LyricsAnalyzeRequest(BaseModel):
    lyrics: str
    style_reference: str | None = None


class LineNote(BaseModel):
    line: str
    note: str


class LyricsAnalyzeResponse(BaseModel):
    overall_notes: str
    rhyme_notes: str
    repetition_notes: str
    cadence_notes: str
    line_by_line: list[LineNote]


class LyricsGenerateRequest(BaseModel):
    lyrics: str
    theme_or_prompt: str
    style_reference: str | None = None
    count: int = 4


class LyricsGenerateResponse(BaseModel):
    candidates: list[str]


# ---------------------------------------------------------------------------
# AI Coach (Phase 3)
# ---------------------------------------------------------------------------


class CoachUploadResponse(BaseModel):
    track_id: str
    filename: str
    duration_sec: float


class CoachFeedbackRequest(BaseModel):
    track_id: str


class TrackFeatures(BaseModel):
    bpm: float
    key: str
    rms_db: float
    brightness_hz: float


class CoachFeedbackResponse(BaseModel):
    track_id: str
    features: TrackFeatures
    strengths: list[str]
    improvements: list[str]
    follow_up_questions: list[str]


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class CoachChatRequest(BaseModel):
    track_id: str
    messages: list[ChatMessage]


class CoachChatResponse(BaseModel):
    reply: str
