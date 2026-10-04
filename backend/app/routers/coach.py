import uuid
from pathlib import Path

import anyio
from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import (
    AiStatusResponse,
    CoachChatRequest,
    CoachChatResponse,
    CoachFeedbackRequest,
    CoachFeedbackResponse,
    CoachHistoryEntry,
    CoachUploadResponse,
    InsightRequest,
    InsightResponse,
)
from app.services import ai_producer, audio_analysis, history, ollama_client
from app.services.audio_analysis import AudioLoadError
from app.services.ollama_client import OllamaError

router = APIRouter(prefix="/api/coach", tags=["coach"])

_ALLOWED_EXTENSIONS = (".wav", ".mp3", ".m4a", ".flac", ".aiff")
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB, per docs/FEATURE_COACH.md


def _write_upload(file: UploadFile, dest: Path, max_bytes: int) -> None:
    """Synchronous, blocking file write — run via `anyio.to_thread.run_sync` by the caller so a
    large upload's disk I/O doesn't block the event loop any more than the analysis pass does."""
    size = 0
    with dest.open("wb") as f:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413, detail=f"File exceeds the {max_bytes // (1024 * 1024)}MB upload limit."
                )
            f.write(chunk)


@router.post("/upload", response_model=CoachUploadResponse)
async def upload(file: UploadFile):
    if not file.filename.lower().endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"File must be one of: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    track_id = str(uuid.uuid4())
    dest = settings.upload_dir / f"{track_id}_{file.filename}"
    await anyio.to_thread.run_sync(_write_upload, file, dest, _MAX_UPLOAD_BYTES)

    try:
        features = await audio_analysis.extract_features(dest)
    except AudioLoadError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await history.save_coach_track(track_id, file.filename, features["duration_sec"])
    return CoachUploadResponse(
        track_id=track_id, filename=file.filename, duration_sec=features["duration_sec"]
    )


@router.post("/feedback", response_model=CoachFeedbackResponse)
async def feedback(body: CoachFeedbackRequest):
    matches = list(settings.upload_dir.glob(f"{body.track_id}_*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Unknown track_id — upload the track first.")

    try:
        result = await audio_analysis.generate_feedback(body.track_id, matches[0])
    except AudioLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await history.save_coach_feedback(body.track_id, result)
    return result


@router.get("/ai-status", response_model=AiStatusResponse)
async def ai_status():
    status = await ollama_client.ping()
    return AiStatusResponse(available=status["available"], model=status["model"])


async def _load_feedback(track_id: str) -> CoachFeedbackResponse:
    fb = await history.get_coach_feedback(track_id)
    if fb is None:
        raise HTTPException(status_code=404, detail="Unknown track_id — analyze the track first.")
    return fb


def _check_segment(fb: CoachFeedbackResponse, index: int | None) -> None:
    if index is not None and not 0 <= index < len(fb.segments):
        raise HTTPException(status_code=400, detail="segment_index out of range.")


@router.post("/insight", response_model=InsightResponse)
async def insight(body: InsightRequest):
    fb = await _load_feedback(body.track_id)
    _check_segment(fb, body.segment_index)
    try:
        text, unverified = await ai_producer.section_insight(fb, body.segment_index)
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail="Local AI isn't available.") from exc
    return InsightResponse(text=text, model=ai_producer.model_name(), unverified_claims=unverified)


@router.post("/chat", response_model=CoachChatResponse)
async def chat(body: CoachChatRequest):
    fb = await _load_feedback(body.track_id)
    _check_segment(fb, body.segment_index)
    try:
        reply, unverified = await ai_producer.chat(fb, body.messages, body.segment_index)
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail="Local AI isn't available.") from exc
    return CoachChatResponse(reply=reply, unverified_claims=unverified)


@router.get("/history", response_model=list[CoachHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_coach_history(limit)
