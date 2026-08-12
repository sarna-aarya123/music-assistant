from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    LyricsAnalyzeRequest,
    LyricsAnalyzeResponse,
    LyricsGenerateRequest,
    LyricsGenerateResponse,
    LyricsHistoryEntry,
)
from app.services import history, lyrics_lab, ollama_client
from app.services.lyrics_lab import LyricsLLMError

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.post("/analyze", response_model=LyricsAnalyzeResponse)
async def analyze(body: LyricsAnalyzeRequest):
    try:
        result = await lyrics_lab.analyze_lyrics(body.lyrics, body.style_reference)
    except ollama_client.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LyricsLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    await history.save_lyrics_session("analyze", body.lyrics, body.style_reference, None, result)
    return result


@router.post("/generate", response_model=LyricsGenerateResponse)
async def generate(body: LyricsGenerateRequest):
    try:
        candidates = await lyrics_lab.generate_lines(
            body.lyrics, body.theme_or_prompt, body.style_reference, body.count
        )
    except ollama_client.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LyricsLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    await history.save_lyrics_session(
        "generate", body.lyrics, body.style_reference, body.theme_or_prompt, candidates
    )
    return LyricsGenerateResponse(candidates=candidates)


@router.get("/history", response_model=list[LyricsHistoryEntry])
async def get_history(limit: int = 20):
    return await history.list_lyrics_history(limit)
