import shutil
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import MidiAnalysisResponse, MidiHistoryEntry
from app.services import history, midi_analysis

router = APIRouter(prefix="/api/midi", tags=["midi"])


@router.post("/analyze", response_model=MidiAnalysisResponse)
async def analyze(file: UploadFile):
    if not file.filename.lower().endswith((".mid", ".midi")):
        raise HTTPException(status_code=400, detail="File must be a .mid or .midi file.")

    dest = settings.upload_dir / f"{uuid.uuid4()}_{file.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = await midi_analysis.analyze_midi(dest)
    except Exception as exc:  # pretty_midi raises several distinct error types on malformed files
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not parse MIDI file: {exc}") from exc

    await history.save_midi_analysis(file.filename, result)
    return result


@router.get("/history", response_model=list[MidiHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_midi_history(limit)
