"""SQLite persistence for feature history (Phase 4 — see PLAN.md).

One shared file-backed database at `settings.db_path`. Connections are opened per call rather
than pooled — this is a single-user local tool with low write volume, so the overhead is
negligible and it avoids managing connection lifetime across requests.
"""

from contextlib import asynccontextmanager

import aiosqlite

from app.core.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS midi_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    filename TEXT NOT NULL,
    bpm REAL NOT NULL,
    time_signature TEXT NOT NULL,
    key TEXT NOT NULL,
    note_density REAL NOT NULL,
    pitch_low TEXT NOT NULL,
    pitch_high TEXT NOT NULL,
    avg_velocity INTEGER NOT NULL,
    track_count INTEGER NOT NULL,
    ai_available INTEGER NOT NULL,
    feel_summary TEXT NOT NULL,
    notes TEXT NOT NULL,
    suggestions_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lyric_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    mode TEXT NOT NULL,
    lyrics TEXT NOT NULL,
    style_reference TEXT,
    theme_or_prompt TEXT,
    result_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_tracks (
    track_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    filename TEXT NOT NULL,
    duration_sec REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_feedback (
    track_id TEXT PRIMARY KEY REFERENCES coach_tracks(track_id),
    created_at TEXT NOT NULL,
    features_json TEXT NOT NULL,
    ai_available INTEGER NOT NULL,
    strengths_json TEXT NOT NULL,
    improvements_json TEXT NOT NULL,
    follow_up_questions_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL REFERENCES coach_tracks(track_id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        await db.executescript(_SCHEMA)
        await db.commit()


@asynccontextmanager
async def connect():
    """Open a connection with Row access (`row["col"]`), for use as `async with connect() as db:`."""
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db
