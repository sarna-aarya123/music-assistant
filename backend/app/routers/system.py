"""Ollama install-check endpoint — not currently registered in `app/main.py` (see the comment
there). Kept working standalone so it can be re-registered without repair once an AI layer is
reconnected.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import ollama_client

router = APIRouter(prefix="/api/system", tags=["system"])


class OllamaAvailabilityResponse(BaseModel):
    installed: bool


@router.get("/ollama-installed", response_model=OllamaAvailabilityResponse)
async def ollama_installed():
    return OllamaAvailabilityResponse(installed=ollama_client.is_installed())
