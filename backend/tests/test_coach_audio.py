"""Coverage for the low-memory audio analysis changes (fixed sample rate + duration cap).

Three things this file checks, per the OOM fix:
1. A normal short track still analyzes correctly and the Coach response contract is unchanged.
2. A track longer than the new duration cap is rejected with a clear error, not decoded.
3. `_extract` itself produces sane values at the new fixed sample rate.
"""

import io
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


def _make_wav_bytes(duration_sec: float, sr: int = 44100, freq: float = 440.0) -> bytes:
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    audio = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    pcm16 = (audio * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(settings, "db_path", tmp_path / "test.db")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_upload_and_feedback_normal_audio_preserves_contract(client):
    wav_bytes = _make_wav_bytes(duration_sec=3.0)

    upload_res = client.post(
        "/api/coach/upload", files={"file": ("test.wav", wav_bytes, "audio/wav")}
    )
    assert upload_res.status_code == 200
    upload_body = upload_res.json()
    assert set(upload_body) == {"track_id", "filename", "duration_sec"}
    assert upload_body["duration_sec"] == pytest.approx(3.0, abs=0.1)

    feedback_res = client.post(
        "/api/coach/feedback", json={"track_id": upload_body["track_id"]}
    )
    assert feedback_res.status_code == 200
    feedback_body = feedback_res.json()

    assert feedback_body["track_id"] == upload_body["track_id"]
    assert set(feedback_body) == {"track_id", "features", "strengths", "improvements"}

    expected_feature_keys = {
        "bpm",
        "key",
        "rms_db",
        "brightness_hz",
        "rolloff_hz",
        "zero_crossing_rate",
        "dynamic_range_db",
        "low_end_ratio",
        "onset_density",
    }
    assert set(feedback_body["features"]) == expected_feature_keys

    assert isinstance(feedback_body["strengths"], list) and feedback_body["strengths"]
    assert isinstance(feedback_body["improvements"], list) and feedback_body["improvements"]


def test_upload_rejects_audio_over_duration_cap(client):
    from app.services.audio_analysis import _MAX_DURATION_SEC

    wav_bytes = _make_wav_bytes(duration_sec=_MAX_DURATION_SEC + 30)

    res = client.post(
        "/api/coach/upload", files={"file": ("too_long.wav", wav_bytes, "audio/wav")}
    )
    assert res.status_code == 400
    assert "too long" in res.json()["detail"].lower()


def test_extract_at_fixed_sample_rate_produces_sane_values(tmp_path):
    from app.services.audio_analysis import _extract

    wav_path = tmp_path / "tone.wav"
    wav_path.write_bytes(_make_wav_bytes(duration_sec=2.0, sr=44100, freq=440.0))

    result = _extract(wav_path)

    assert result["duration_sec"] == pytest.approx(2.0, abs=0.05)
    assert result["bpm"] >= 0.0
    assert result["key"] != ""
    assert 0.0 <= result["zero_crossing_rate"] <= 1.0
    assert 0.0 <= result["low_end_ratio"] <= 1.0
