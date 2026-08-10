"""Thin async wrapper around the local Ollama HTTP API.

This is generic infra (not feature-specific logic), so unlike the analysis services it is fully
implemented — every feature phase will call through here rather than hitting Ollama directly.

Requires Ollama running locally: https://ollama.com (`ollama serve`, and a model pulled, e.g.
`ollama pull llama3.1`).
"""

import json
import re

import httpx

from app.core.config import settings


class OllamaError(RuntimeError):
    """Raised when Ollama can't be reached or returns an error."""


async def chat(
    messages: list[dict[str, str]], model: str | None = None, temperature: float | None = None
) -> str:
    """Send a chat-style message list to Ollama and return the assistant's reply text.

    `messages` is a list of {"role": "user"|"assistant"|"system", "content": "..."} dicts,
    matching Ollama's /api/chat format. `temperature` is worth lowering (e.g. 0.3) for prompts
    that ask for strict JSON output — smaller/weaker models are more likely to produce malformed
    JSON (mismatched brackets, run-on strings) at default temperature.
    """
    payload: dict = {
        "model": model or settings.ollama_model,
        "messages": messages,
        "stream": False,
    }
    if temperature is not None:
        payload["options"] = {"temperature": temperature}
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


async def generate(
    prompt: str, system: str | None = None, model: str | None = None, temperature: float | None = None
) -> str:
    """Convenience wrapper for a single-turn prompt (no conversation history)."""
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return await chat(messages, model=model, temperature=temperature)


def parse_json_response(text: str) -> dict:
    """Parse a model reply that's supposed to be a single JSON object.

    Every feature prompts the model to respond with ONLY JSON, but models routinely wrap it in
    markdown code fences and (llama3:8b in particular) emit invalid backslash-escapes like `\\'`
    inside strings — not valid per the JSON spec, but harmless to just unescape. Raises
    `json.JSONDecodeError` if the result still isn't valid JSON after cleanup.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    cleaned = re.sub(r"\\'", "'", cleaned)
    return json.loads(cleaned)
