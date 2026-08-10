from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import coach, lyrics, midi

app = FastAPI(
    title="AI Music Assistant API",
    description="Backend for the AI Coach, MIDI Analyzer, and Lyric Lab features.",
    version="0.1.0",
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
