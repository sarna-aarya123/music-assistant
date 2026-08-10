import shutil
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import (
    CoachChatRequest,
    CoachChatResponse,
    CoachFeedbackRequest,
    CoachFeedbackResponse,
    CoachUploadResponse,
)
from app.services import audio_analysis

router = APIRouter(prefix="/api/coach", tags=["coach"])

_ALLOWED_EXTENSIONS = (".wav", ".mp3", ".m4a", ".flac", ".aiff")


@router.post("/upload", response_model=CoachUploadResponse)
async def upload(file: UploadFile):
    if not file.filename.lower().endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"File must be one of: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    track_id = str(uuid.uuid4())
    dest = settings.upload_dir / f"{track_id}_{file.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        features = await audio_analysis.extract_features(dest)
        duration_sec = features.get("duration_sec", 0.0)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    return CoachUploadResponse(track_id=track_id, filename=file.filename, duration_sec=duration_sec)


@router.post("/feedback", response_model=CoachFeedbackResponse)
async def feedback(body: CoachFeedbackRequest):
    matches = list(settings.upload_dir.glob(f"{body.track_id}_*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Unknown track_id — upload the track first.")

    try:
        return await audio_analysis.generate_feedback(body.track_id, matches[0])
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@router.post("/chat", response_model=CoachChatResponse)
async def chat(body: CoachChatRequest):
    try:
        reply = await audio_analysis.continue_chat(body.track_id, body.messages)
        return CoachChatResponse(reply=reply)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
