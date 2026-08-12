import shutil
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import (
    ChatMessage,
    CoachChatHistoryEntry,
    CoachChatRequest,
    CoachChatResponse,
    CoachFeedbackRequest,
    CoachFeedbackResponse,
    CoachHistoryEntry,
    CoachUploadResponse,
)
from app.services import audio_analysis, history, ollama_client
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
        result = await audio_analysis.generate_feedback(body.track_id, matches[0], use_ai=body.use_ai)
    except AudioLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await history.save_coach_feedback(body.track_id, result)
    return result


@router.post("/chat", response_model=CoachChatResponse)
async def chat(body: CoachChatRequest):
    try:
        reply = await audio_analysis.continue_chat(body.track_id, body.messages)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail="No analysis found for this track_id — get feedback first."
        ) from exc
    except ollama_client.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # The frontend sends the full conversation each turn; only the newest user message plus this
    # reply are new since the last call.
    new_messages = body.messages[-1:] + [ChatMessage(role="assistant", content=reply)]
    await history.append_coach_chat_messages(body.track_id, new_messages)
    return CoachChatResponse(reply=reply)


@router.get("/history", response_model=list[CoachHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_coach_history(limit)


@router.get("/history/{track_id}/chat", response_model=list[CoachChatHistoryEntry])
async def get_chat_history(track_id: str):
    return await history.get_coach_chat_history(track_id)
