from app.services.audio_analysis import _per_second_curves
from app.services.mood import estimate_mood
import numpy as np


def test_loud_dense_dark_beat_is_aggressive():
    label, energy, tone = estimate_mood(bpm=140, rms_db=-6, brightness_hz=1800, onset_density=4.5, low_end_ratio=0.8)
    assert label == "Aggressive" and energy > 0.62 and tone < 0.5


def test_quiet_sparse_bright_track_is_chill():
    label, energy, _ = estimate_mood(bpm=80, rms_db=-18, brightness_hz=3800, onset_density=0.6, low_end_ratio=0.2)
    assert label == "Chill" and energy < 0.34


def test_silence_has_no_mood():
    assert estimate_mood(0, -120, 0, 0, 0) == ("", 0.0, 0.0)


def test_per_second_curves_cover_every_second_and_count_onsets():
    sr, hop = 22050, 1024
    fps = sr / hop
    n = int(fps * 5)  # five seconds of frames
    rms = np.full(n, 0.1)
    centroid = np.full(n, 2000.0)
    low = np.full(n, 0.5)
    out = _per_second_curves(rms, centroid, low, [0.2, 0.7, 2.5], sr, hop, 5.0)
    assert {k: len(v) for k, v in out.items()} == {
        "second_loudness_db": 5,
        "second_brightness_hz": 5,
        "second_low_end": 5,
        "second_onsets": 5,
    }
    assert out["second_onsets"] == [2, 0, 1, 0, 0]
    assert out["second_loudness_db"][0] == -20.0 and out["second_brightness_hz"][0] == 2000.0
