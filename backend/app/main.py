from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db
from app.routers import coach, lyrics, midi

# app.routers.system (Ollama install-check endpoint) is intentionally not registered — nothing in
# the UI needs it right now that Ollama isn't wired up to any route. The file is left in place.


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="AI Music Assistant API",
    description="Backend for the AI Coach, MIDI Analyzer, and Lyric Lab features.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(midi.router)
app.include_router(lyrics.router)
app.include_router(coach.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
