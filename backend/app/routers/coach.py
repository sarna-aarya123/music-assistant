import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import (
    CoachFeedbackRequest,
    CoachFeedbackResponse,
    CoachHistoryEntry,
    CoachUploadResponse,
)
from app.services import audio_analysis, history
from app.services.audio_analysis import AudioLoadError

router = APIRouter(prefix="/api/coach", tags=["coach"])

_ALLOWED_EXTENSIONS = (".wav", ".mp3", ".m4a", ".flac", ".aiff")
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB, per docs/FEATURE_COACH.md


@router.post("/upload", response_model=CoachUploadResponse)
async def upload(file: UploadFile):
    if not file.filename.lower().endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"File must be one of: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    track_id = str(uuid.uuid4())
    dest = settings.upload_dir / f"{track_id}_{file.filename}"
    size = 0
    with dest.open("wb") as f:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > _MAX_UPLOAD_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File exceeds the 50MB upload limit.")
            f.write(chunk)

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


@router.get("/history", response_model=list[CoachHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_coach_history(limit)
