"""Coverage for the low-memory audio analysis changes (fixed sample rate + duration cap), the
event-loop-blocking fix (thread offload for the synchronous librosa/file-write work), and the two
rounds of peak-memory refactor (shared onset envelope + scoped `_spectral_features` helper, then
`tuning=0` + coarser hop_length inside that helper).

What this file checks:
1. A normal short track still analyzes correctly and the Coach response contract is unchanged.
2. A track longer than the new duration cap is rejected with a clear error, not decoded.
3. `_extract` itself produces sane values at the new fixed sample rate.
4. A concurrent request (e.g. Render's own /health probe) is still served promptly while a slow
   analysis is in flight on the same process — regression coverage for the health-check-timeout
   bug caused by running blocking librosa work directly on the event loop.
5. The scoped `_spectral_features` helper returns the expected shape/ranges on its own.
6. Sharing one `onset_envelope` between `beat_track` and `onset_detect` produces numerically the
   same `bpm`/`onset_density` as each function computing its own envelope independently — proving
   the dedup is a pure deduplication, not an approximation that changed the analysis.
7. `_spectral_features`'s `tuning=0` + `hop_length=1024` change (the second peak-memory fix, which
   removed chroma_stft's internal auto-tuning pass — the single largest allocation measured in the
   whole pipeline) stays numerically close to the pre-optimization behavior (default tuning
   estimation, hop_length=512) — same `key`, brightness/rolloff within a small tolerance.
8. Key detection is sane on a clear single-pitch tone.
"""

import asyncio
import io
import time
import wave

import httpx
import librosa
import numpy as np
import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport

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


def _make_pulsed_wav_bytes(duration_sec: float, sr: int = 44100, pulse_hz: float = 4.0) -> bytes:
    """A gated tone with clear percussive-like onsets, so onset/beat detection has something real
    to find (a plain steady sine wave often yields zero onsets, which is a weak equivalence test)."""
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    gate = (np.sin(2 * np.pi * pulse_hz * t) > 0).astype(np.float32)
    audio = (0.4 * gate * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)
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


def test_health_stays_responsive_during_slow_audio_analysis(client, monkeypatch):
    """Regression test for the health-check-timeout bug: a slow analysis must not block the event
    loop, or a concurrent /health request (like Render's own probe) stalls behind it too."""
    from app.main import app
    from app.services import audio_analysis

    _SLOW_SECONDS = 1.5

    def _slow_extract(_file_path):
        time.sleep(_SLOW_SECONDS)  # simulates CPU-bound librosa work with a blocking sleep
        return {
            "duration_sec": 1.0,
            "bpm": 120.0,
            "key": "C major",
            "rms_db": -12.0,
            "brightness_hz": 2000.0,
            "rolloff_hz": 4000.0,
            "zero_crossing_rate": 0.05,
            "dynamic_range_db": 10.0,
            "low_end_ratio": 0.2,
            "onset_density": 1.0,
        }

    monkeypatch.setattr(audio_analysis, "_extract", _slow_extract)
    wav_bytes = _make_wav_bytes(duration_sec=1.0)

    async def run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            upload_task = asyncio.create_task(
                ac.post("/api/coach/upload", files={"file": ("t.wav", wav_bytes, "audio/wav")})
            )
            await asyncio.sleep(0.2)  # let the upload request start and enter the "slow" analysis

            start = time.monotonic()
            health_res = await ac.get("/health")
            health_elapsed = time.monotonic() - start

            upload_res = await upload_task
            return health_res, health_elapsed, upload_res

    health_res, health_elapsed, upload_res = asyncio.run(run())

    assert health_res.status_code == 200
    # If the slow analysis were still running directly on the event loop, /health couldn't be
    # answered until it finished (~1.5s). A generous margin below that proves it wasn't blocked.
    assert health_elapsed < _SLOW_SECONDS / 2
    assert upload_res.status_code == 200


def test_spectral_features_helper_returns_expected_shape(tmp_path):
    from app.services.audio_analysis import _spectral_features

    wav_path = tmp_path / "tone.wav"
    wav_path.write_bytes(_make_wav_bytes(duration_sec=2.0, sr=44100, freq=440.0))
    y, sr = librosa.load(str(wav_path), sr=22050, mono=True)

    result = _spectral_features(y, sr)

    assert set(result) == {"key", "brightness_hz", "rolloff_hz", "low_end_ratio"}
    assert result["key"] != ""
    assert result["brightness_hz"] >= 0.0
    assert result["rolloff_hz"] >= 0.0
    assert 0.0 <= result["low_end_ratio"] <= 1.0


def test_shared_onset_envelope_matches_independently_computed_envelopes(tmp_path):
    """The dedup in `_extract` (one `onset_envelope=` shared between `beat_track` and
    `onset_detect`) must produce the same bpm/onset_density as each function computing its own
    envelope independently — confirms this is a pure deduplication, not a behavior change."""
    from app.services.audio_analysis import _extract

    wav_path = tmp_path / "pulsed.wav"
    wav_path.write_bytes(_make_pulsed_wav_bytes(duration_sec=4.0))

    result = _extract(wav_path)

    # Recompute the "naive" way — each function builds its own onset envelope, exactly how this
    # code worked before the dedup — at the same fixed decode rate `_extract` uses internally.
    y, sr = librosa.load(str(wav_path), sr=22050, mono=True)
    duration_sec = round(float(librosa.get_duration(y=y, sr=sr)), 2)

    tempo_naive, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm_naive = round(float(np.asarray(tempo_naive).reshape(-1)[0]), 1)

    onsets_naive = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    onset_density_naive = round(len(onsets_naive) / duration_sec, 2) if duration_sec > 0 else 0.0

    assert result["bpm"] == pytest.approx(bpm_naive, abs=0.05)
    assert result["onset_density"] == pytest.approx(onset_density_naive, abs=0.02)


def test_spectral_features_close_to_pre_optimization_tuning_and_hop(tmp_path):
    """`_spectral_features` now uses `tuning=0` + `hop_length=1024` (peak-memory fix — see the
    comment on `_SPECTRAL_HOP_LENGTH`). Confirm this stays numerically close to the previous
    behavior (chroma_stft's default automatic tuning estimation, hop_length=512) rather than having
    silently changed what the Coach reports — `key` should match exactly, and the mean-aggregated
    stats should be within a small tolerance."""
    from app.services.audio_analysis import _estimate_key, _low_end_ratio, _spectral_features

    wav_path = tmp_path / "mix.wav"
    wav_path.write_bytes(_make_pulsed_wav_bytes(duration_sec=6.0))
    y, sr = librosa.load(str(wav_path), sr=22050, mono=True)

    result = _spectral_features(y, sr)

    # Reference: the pre-optimization behavior — default tuning estimation, default hop_length.
    stft_ref = np.abs(librosa.stft(y))
    freqs_ref = librosa.fft_frequencies(sr=sr, n_fft=(stft_ref.shape[0] - 1) * 2)
    chroma_ref = librosa.feature.chroma_stft(y=y, sr=sr, S=stft_ref**2)
    key_ref = _estimate_key(chroma_ref.mean(axis=1))
    brightness_ref = round(float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr, S=stft_ref))), 1)
    rolloff_ref = round(float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, S=stft_ref))), 1)
    low_end_ref = _low_end_ratio(stft_ref, freqs_ref)

    assert result["key"] == key_ref
    assert result["brightness_hz"] == pytest.approx(brightness_ref, rel=0.02)
    assert result["rolloff_hz"] == pytest.approx(rolloff_ref, rel=0.02)
    assert result["low_end_ratio"] == pytest.approx(low_end_ref, abs=0.02)


def test_key_detection_is_sane_on_a_clear_tone(tmp_path):
    from app.services.audio_analysis import _extract

    wav_path = tmp_path / "a440.wav"
    wav_path.write_bytes(_make_wav_bytes(duration_sec=3.0, sr=44100, freq=440.0))

    result = _extract(wav_path)

    # A pure 440Hz tone's energy is concentrated in the "A" pitch class — the detected key should
    # be rooted there regardless of major/minor (a single pitch can't disambiguate the third).
    assert result["key"].startswith("A")
