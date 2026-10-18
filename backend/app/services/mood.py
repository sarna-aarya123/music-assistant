"""Estimated mood of a track from measurements already computed — no model, no extra audio pass.

Two axes, both 0-1:
- energy: how hard the track hits (loudness, rhythmic density, low-end weight, a little tempo)
- tone:   how dark vs. bright it sounds (spectral centroid)

The label is a coarse 3x2 grid over those axes. It's an *estimate* by design: it deliberately does
not use major/minor key (whole-track key detection is unreliable on bass-heavy beats), so it can
say "aggressive" or "chill" but not "happy" vs "sad".
"""


def _unit(value: float, low: float, high: float) -> float:
    """Linearly maps [low, high] onto [0, 1], clamped."""
    if high <= low:
        return 0.0
    return min(1.0, max(0.0, (value - low) / (high - low)))


_LABELS = {
    ("high", "dark"): "Aggressive",
    ("high", "bright"): "Energetic",
    ("mid", "dark"): "Dark",
    ("mid", "bright"): "Uplifting",
    ("low", "dark"): "Moody",
    ("low", "bright"): "Chill",
}


def estimate_mood(
    bpm: float, rms_db: float, brightness_hz: float, onset_density: float, low_end_ratio: float
) -> tuple[str, float, float]:
    """Returns (label, energy, tone). Silent/empty input returns ("", 0, 0)."""
    if bpm <= 0 and rms_db <= -100:
        return "", 0.0, 0.0

    loudness = _unit(rms_db, -20.0, -4.0)
    density = _unit(onset_density, 0.0, 5.0)
    # Beat trackers often lock onto half/double time (70 vs 140), so tempo only gets a small say.
    tempo = _unit(bpm, 70.0, 160.0)
    low_end = _unit(low_end_ratio, 0.2, 0.8)
    energy = 0.4 * loudness + 0.3 * density + 0.15 * low_end + 0.15 * tempo

    tone = _unit(brightness_hz, 1200.0, 4200.0)

    band = "low" if energy < 0.34 else "mid" if energy < 0.62 else "high"
    side = "dark" if tone < 0.5 else "bright"
    return _LABELS[(band, side)], round(energy, 3), round(tone, 3)
