from fastapi import APIRouter

from app.models.schemas import OllamaAvailabilityResponse
from app.services import ollama_client

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/ollama-installed", response_model=OllamaAvailabilityResponse)
async def ollama_installed():
    return OllamaAvailabilityResponse(installed=ollama_client.is_installed())
