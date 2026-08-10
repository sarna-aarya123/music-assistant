import shutil
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import MidiAnalysisResponse
from app.services import midi_analysis

router = APIRouter(prefix="/api/midi", tags=["midi"])


@router.post("/analyze", response_model=MidiAnalysisResponse)
async def analyze(file: UploadFile):
    if not file.filename.lower().endswith((".mid", ".midi")):
        raise HTTPException(status_code=400, detail="File must be a .mid or .midi file.")

    dest = settings.upload_dir / f"{uuid.uuid4()}_{file.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        return await midi_analysis.analyze_midi(dest)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
