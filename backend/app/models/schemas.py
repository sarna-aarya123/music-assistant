"""Shared Pydantic request/response models for all three features.

These define the API contract described in ARCHITECTURE.md. Every feature currently runs on
deterministic Python analysis only (pretty_midi/librosa/pronouncing) — no LLM calls are wired up
to any route right now. `app/services/ollama_client.py` and a few AI-narrative service functions
(`lyrics_lab.generate_lines`, `audio_analysis.continue_chat`) are kept in the codebase, unused, so
an AI layer can be reconnected later without redesigning the API — but no schema field here should
imply an AI/Ollama dependency exists today.
"""

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# MIDI Analyzer
# ---------------------------------------------------------------------------


class MidiAnalysisResponse(BaseModel):
    # Core features — pretty_midi.
    bpm: float
    time_signature: str
    key: str
    note_density: float
    pitch_range: tuple[str, str]
    avg_velocity: int
    track_count: int

    # Deeper deterministic features — still pretty_midi alone, no LLM involved.
    unique_pitch_classes: int
    velocity_range: tuple[int, int]
    avg_note_length_sec: float
    polyphony: int
    syncopation: float

    # Rule-based read on the features above (plain Python thresholds, not a model call).
    feel_summary: str
    notes: str
    suggestions: list[str]


class MidiHistoryEntry(MidiAnalysisResponse):
    id: int
    created_at: str
    filename: str


# ---------------------------------------------------------------------------
# Lyric Lab
# ---------------------------------------------------------------------------


class LyricsAnalyzeRequest(BaseModel):
    lyrics: str


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
    """Kept for a future AI-generation pass — not wired up to any route right now."""

    lyrics: str
    theme_or_prompt: str
    style_reference: str | None = None
    count: int = 4


class LyricsGenerateResponse(BaseModel):
    candidates: list[str]


class LyricsHistoryEntry(BaseModel):
    id: int
    created_at: str
    mode: str  # "analyze" (only mode produced today; "generate" may exist in older history rows)
    lyrics: str
    style_reference: str | None = None
    theme_or_prompt: str | None = None
    result: dict  # LyricsAnalyzeResponse shape (or a legacy {"candidates": [...]} shape)


# ---------------------------------------------------------------------------
# AI Coach
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
    # Deeper deterministic features — still librosa alone, no LLM involved. Defaulted to 0 so
    # history rows saved before these fields existed still deserialize.
    rolloff_hz: float = 0.0
    zero_crossing_rate: float = 0.0
    dynamic_range_db: float = 0.0
    low_end_ratio: float = 0.0
    onset_density: float = 0.0


class CoachFeedbackResponse(BaseModel):
    track_id: str
    features: TrackFeatures
    # Rule-based read on the features above (plain Python thresholds, not a model call).
    strengths: list[str]
    improvements: list[str]


class ChatMessage(BaseModel):
    """Kept for a future AI-chat pass — not wired up to any route right now."""

    role: str  # "user" | "assistant"
    content: str


class CoachChatRequest(BaseModel):
    track_id: str
    messages: list[ChatMessage]


class CoachChatResponse(BaseModel):
    reply: str


class CoachHistoryEntry(BaseModel):
    track_id: str
    created_at: str
    filename: str
    duration_sec: float
    feedback: CoachFeedbackResponse | None = None


class CoachChatHistoryEntry(BaseModel):
    role: str
    content: str
    created_at: str
