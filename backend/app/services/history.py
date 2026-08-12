"""Read/write history for all three features, backed by SQLite (Phase 4 — see PLAN.md).

Routers call `save_*` right after producing a result, and expose the `list_*`/`get_*` functions
as history endpoints so users can revisit past sessions. Keeping this separate from
midi_analysis.py/lyrics_lab.py/audio_analysis.py mirrors how ollama_client.py is the one place
that owns Ollama specifics — this is the one place that owns SQLite specifics.
"""

import json
from datetime import datetime, timezone

from app.core.db import connect
from app.models.schemas import (
    CoachFeedbackResponse,
    CoachHistoryEntry,
    LyricsAnalyzeResponse,
    LyricsHistoryEntry,
    MidiAnalysisResponse,
    MidiHistoryEntry,
    TrackFeatures,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# MIDI Analyzer
# ---------------------------------------------------------------------------


async def save_midi_analysis(filename: str, result: MidiAnalysisResponse) -> None:
    async with connect() as db:
        await db.execute(
            "INSERT INTO midi_analyses (created_at, filename, bpm, time_signature, key, "
            "note_density, pitch_low, pitch_high, avg_velocity, track_count, ai_available, "
            "feel_summary, notes, suggestions_json, unique_pitch_classes, velocity_low, "
            "velocity_high, avg_note_length_sec, polyphony, syncopation) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                _now(),
                filename,
                result.bpm,
                result.time_signature,
                result.key,
                result.note_density,
                result.pitch_range[0],
                result.pitch_range[1],
                result.avg_velocity,
                result.track_count,
                1,  # ai_available — vestigial, see core/db.py
                result.feel_summary,
                result.notes,
                json.dumps(result.suggestions),
                result.unique_pitch_classes,
                result.velocity_range[0],
                result.velocity_range[1],
                result.avg_note_length_sec,
                result.polyphony,
                result.syncopation,
            ),
        )
        await db.commit()


async def list_midi_history(limit: int = 20) -> list[MidiHistoryEntry]:
    async with connect() as db:
        cursor = await db.execute("SELECT * FROM midi_analyses ORDER BY id DESC LIMIT ?", (limit,))
        rows = await cursor.fetchall()
    return [
        MidiHistoryEntry(
            id=row["id"],
            created_at=row["created_at"],
            filename=row["filename"],
            bpm=row["bpm"],
            time_signature=row["time_signature"],
            key=row["key"],
            note_density=row["note_density"],
            pitch_range=(row["pitch_low"], row["pitch_high"]),
            avg_velocity=row["avg_velocity"],
            track_count=row["track_count"],
            unique_pitch_classes=row["unique_pitch_classes"],
            velocity_range=(row["velocity_low"], row["velocity_high"]),
            avg_note_length_sec=row["avg_note_length_sec"],
            polyphony=row["polyphony"],
            syncopation=row["syncopation"],
            feel_summary=row["feel_summary"],
            notes=row["notes"],
            suggestions=json.loads(row["suggestions_json"]),
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Lyric Lab
# ---------------------------------------------------------------------------


async def save_lyrics_session(
    mode: str,
    lyrics: str,
    result: LyricsAnalyzeResponse | list[str],
    style_reference: str | None = None,
    theme_or_prompt: str | None = None,
) -> None:
    result_payload = result.model_dump() if isinstance(result, LyricsAnalyzeResponse) else {"candidates": result}
    async with connect() as db:
        await db.execute(
            "INSERT INTO lyric_sessions (created_at, mode, lyrics, style_reference, "
            "theme_or_prompt, result_json) VALUES (?,?,?,?,?,?)",
            (_now(), mode, lyrics, style_reference, theme_or_prompt, json.dumps(result_payload)),
        )
        await db.commit()


async def list_lyrics_history(limit: int = 20) -> list[LyricsHistoryEntry]:
    async with connect() as db:
        cursor = await db.execute("SELECT * FROM lyric_sessions ORDER BY id DESC LIMIT ?", (limit,))
        rows = await cursor.fetchall()
    return [
        LyricsHistoryEntry(
            id=row["id"],
            created_at=row["created_at"],
            mode=row["mode"],
            lyrics=row["lyrics"],
            style_reference=row["style_reference"],
            theme_or_prompt=row["theme_or_prompt"],
            result=json.loads(row["result_json"]),
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# AI Coach
# ---------------------------------------------------------------------------


async def save_coach_track(track_id: str, filename: str, duration_sec: float) -> None:
    async with connect() as db:
        await db.execute(
            "INSERT INTO coach_tracks (track_id, created_at, filename, duration_sec) VALUES (?,?,?,?)",
            (track_id, _now(), filename, duration_sec),
        )
        await db.commit()


async def save_coach_feedback(track_id: str, result: CoachFeedbackResponse) -> None:
    async with connect() as db:
        await db.execute(
            "INSERT OR REPLACE INTO coach_feedback (track_id, created_at, features_json, "
            "ai_available, strengths_json, improvements_json, follow_up_questions_json) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                track_id,
                _now(),
                json.dumps(result.features.model_dump()),
                0,  # ai_available — vestigial, see core/db.py
                json.dumps(result.strengths),
                json.dumps(result.improvements),
                "[]",  # follow_up_questions — vestigial, chat is disconnected (see audio_analysis.py)
            ),
        )
        await db.commit()


async def get_coach_context(track_id: str) -> str | None:
    """Reconstruct the grounding context (features + prior feedback) for a track from SQLite.

    Used as a fallback when `audio_analysis._track_context` doesn't have the track in memory —
    e.g. after a server restart, or a chat request for a track analyzed in a previous run. Not
    currently called by any active route (chat is disconnected) — kept working for when it is.
    """
    async with connect() as db:
        cursor = await db.execute(
            "SELECT ct.duration_sec, cf.features_json, cf.strengths_json, cf.improvements_json "
            "FROM coach_tracks ct JOIN coach_feedback cf ON cf.track_id = ct.track_id "
            "WHERE ct.track_id = ?",
            (track_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None

    features = json.loads(row["features_json"])
    strengths = json.loads(row["strengths_json"])
    improvements = json.loads(row["improvements_json"])
    feature_summary = (
        f"BPM: {features['bpm']:.1f}\n"
        f"Key estimate: {features['key']}\n"
        f"Loudness (RMS): {features['rms_db']} dB\n"
        f"Brightness (spectral centroid): {features['brightness_hz']:.0f} Hz\n"
        f"Duration: {row['duration_sec']:.1f}s"
    )
    return (
        f"Track features:\n{feature_summary}\n\n"
        f"Feedback already given — strengths: {'; '.join(strengths) or '(none yet)'}\n"
        f"Feedback already given — improvements: {'; '.join(improvements) or '(none yet)'}"
    )


async def list_coach_history(limit: int = 20) -> list[CoachHistoryEntry]:
    async with connect() as db:
        cursor = await db.execute(
            "SELECT ct.track_id, ct.created_at, ct.filename, ct.duration_sec, cf.features_json, "
            "cf.strengths_json, cf.improvements_json "
            "FROM coach_tracks ct LEFT JOIN coach_feedback cf ON cf.track_id = ct.track_id "
            "ORDER BY ct.rowid DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()

    entries = []
    for row in rows:
        feedback = None
        if row["features_json"] is not None:
            features = json.loads(row["features_json"])
            feedback = CoachFeedbackResponse(
                track_id=row["track_id"],
                features=TrackFeatures(**features),
                strengths=json.loads(row["strengths_json"]),
                improvements=json.loads(row["improvements_json"]),
            )
        entries.append(
            CoachHistoryEntry(
                track_id=row["track_id"],
                created_at=row["created_at"],
                filename=row["filename"],
                duration_sec=row["duration_sec"],
                feedback=feedback,
            )
        )
    return entries


async def get_coach_chat_history(track_id: str):
    """Kept for a future chat pass — not called by any active route (chat is disconnected)."""
    from app.models.schemas import CoachChatHistoryEntry

    async with connect() as db:
        cursor = await db.execute(
            "SELECT role, content, created_at FROM coach_chat_messages WHERE track_id = ? ORDER BY id",
            (track_id,),
        )
        rows = await cursor.fetchall()
    return [CoachChatHistoryEntry(role=r["role"], content=r["content"], created_at=r["created_at"]) for r in rows]


async def append_coach_chat_messages(track_id: str, messages) -> None:
    """Kept for a future chat pass — not called by any active route (chat is disconnected)."""
    async with connect() as db:
        await db.executemany(
            "INSERT INTO coach_chat_messages (track_id, role, content, created_at) VALUES (?,?,?,?)",
            [(track_id, m.role, m.content, _now()) for m in messages],
        )
        await db.commit()
