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
    # Timestamps (seconds), not just aggregates — drives the waveform explorer's beat grid/onset
    # markers on the frontend. Defaulted to [] for the same history-backcompat reason as above.
    onset_times: list[float] = []
    beat_times: list[float] = []
    # Fixed-length (240 points), 0-1-normalized loudness-over-time curve spanning the whole track —
    # what the full-song map draws as its "long waveform". Not a literal sample-accurate amplitude
    # waveform (see _energy_curve's docstring in audio_analysis.py), but free to produce and reads
    # the same way at this resolution.
    energy_curve: list[float] = []


class SegmentFeatures(BaseModel):
    """The subset of TrackFeatures re-computed on just one time window of the track. Narrower than
    TrackFeatures on purpose — low_end_ratio/rolloff/dynamic_range would need the full STFT kept
    alive per-segment, which isn't worth the memory cost on a 512MB instance for what's meant to be
    a quick per-section comparison, not a duplicate of the whole-track analysis."""

    rms_db: float
    brightness_hz: float
    onset_density: float
    zero_crossing_rate: float


class TrackSegment(BaseModel):
    """One clickable "mark" on the full-song map, and the deep-dive behind it. `mark_sec` is where
    the boundary was detected (and what the frontend places the pin at); the segment itself runs
    `start_sec` to `end_sec`."""

    start_sec: float
    end_sec: float
    mark_sec: float
    features: SegmentFeatures
    # Comparison-aware, plain-Python-generated notes — how this window differs from the track's
    # own average (see _describe_segment in audio_analysis.py), not another model call.
    notes: list[str]


class CoachFeedbackResponse(BaseModel):
    track_id: str
    features: TrackFeatures
    # Rule-based read on the features above (plain Python thresholds, not a model call).
    strengths: list[str]
    improvements: list[str]
    # The full-song map's marks. Defaulted to [] for history-backcompat (rows saved before this
    # field existed).
    segments: list[TrackSegment] = []


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
