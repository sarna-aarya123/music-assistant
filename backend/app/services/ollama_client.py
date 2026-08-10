"""Thin async wrapper around the local Ollama HTTP API.

This is generic infra (not feature-specific logic), so unlike the analysis services it is fully
implemented — every feature phase will call through here rather than hitting Ollama directly.

Requires Ollama running locally: https://ollama.com (`ollama serve`, and a model pulled, e.g.
`ollama pull llama3.1`).
"""

import httpx

from app.core.config import settings


class OllamaError(RuntimeError):
    """Raised when Ollama can't be reached or returns an error."""


async def chat(messages: list[dict[str, str]], model: str | None = None) -> str:
    """Send a chat-style message list to Ollama and return the assistant's reply text.

    `messages` is a list of {"role": "user"|"assistant"|"system", "content": "..."} dicts,
    matching Ollama's /api/chat format.
    """
    payload = {
        "model": model or settings.ollama_model,
        "messages": messages,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(base_url=settings.ollama_host, timeout=120.0) as client:
            response = await client.post("/api/chat", json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OllamaError(
            f"Could not reach Ollama at {settings.ollama_host}. "
            "Is `ollama serve` running and is the model pulled? "
            f"Original error: {exc}"
        ) from exc

    data = response.json()
    return data["message"]["content"]


async def generate(prompt: str, system: str | None = None, model: str | None = None) -> str:
    """Convenience wrapper for a single-turn prompt (no conversation history)."""
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return await chat(messages, model=model)
