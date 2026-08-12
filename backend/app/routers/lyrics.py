from fastapi import APIRouter

from app.models.schemas import LyricsAnalyzeRequest, LyricsAnalyzeResponse, LyricsHistoryEntry
from app.services import history, lyrics_lab

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.post("/analyze", response_model=LyricsAnalyzeResponse)
async def analyze(body: LyricsAnalyzeRequest):
    result = lyrics_lab.analyze_lyrics(body.lyrics)
    await history.save_lyrics_session("analyze", body.lyrics, result)
    return result


@router.get("/history", response_model=list[LyricsHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_lyrics_history(limit)
