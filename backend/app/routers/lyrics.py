from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    LyricsAnalyzeRequest,
    LyricsAnalyzeResponse,
    LyricsGenerateRequest,
    LyricsGenerateResponse,
)
from app.services import lyrics_lab

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.post("/analyze", response_model=LyricsAnalyzeResponse)
async def analyze(body: LyricsAnalyzeRequest):
    try:
        return await lyrics_lab.analyze_lyrics(body.lyrics, body.style_reference)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@router.post("/generate", response_model=LyricsGenerateResponse)
async def generate(body: LyricsGenerateRequest):
    try:
        candidates = await lyrics_lab.generate_lines(
            body.lyrics, body.theme_or_prompt, body.style_reference, body.count
        )
        return LyricsGenerateResponse(candidates=candidates)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
