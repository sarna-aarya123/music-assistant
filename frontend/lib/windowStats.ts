import type { TrackFeatures } from "@/lib/api";

/** A span of the track, in seconds. */
export type TimeWindow = { start: number; end: number };

export const WINDOW_SEC = 30;

export type WindowStats = {
  loudnessDb: number;
  brightnessHz: number;
  /** Share of energy below ~150 Hz, 0-1. */
  lowEnd: number;
  onsetDensity: number;
  /** Spread of the second-by-second level (90th minus 10th percentile, dB) — how much it moves. */
  swingDb: number;
};

export type StudioObjectId = "mic" | "speaker" | "amp" | "mixer";

export type StudioReading = {
  title: string;
  subject: string;
  stats: { label: string; value: string }[];
  /** Plain-language read from threshold rules over the numbers above — no model involved. */
  summary: string;
};

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A `WINDOW_SEC` window centered on `centerSec`, shifted to stay inside the track. */
export function windowAround(centerSec: number, durationSec: number): TimeWindow {
  const span = Math.min(WINDOW_SEC, durationSec);
  const start = Math.min(Math.max(0, centerSec - span / 2), Math.max(0, durationSec - span));
  return { start, end: start + span };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Measures one span from the per-second curves. Computed the same way for a window and for the
 * whole track, so a window-vs-track comparison is always like-for-like. */
export function statsFor(f: TrackFeatures, w: TimeWindow): WindowStats {
  const a = Math.max(0, Math.floor(w.start));
  const b = Math.min(f.second_loudness_db.length, Math.max(a + 1, Math.ceil(w.end)));
  const loud = f.second_loudness_db.slice(a, b);
  const bright = f.second_brightness_hz.slice(a, b);
  const low = f.second_low_end.slice(a, b);
  const onsets = f.second_onsets.slice(a, b);
  // Average in amplitude, not in dB — a few silent seconds shouldn't drag the level down as if
  // they were just "slightly quiet".
  const meanAmp = mean(loud.map((db) => Math.pow(10, db / 20)));
  const sortedLoud = [...loud].sort((x, y) => x - y);
  return {
    loudnessDb: meanAmp > 0 ? Math.round(20 * Math.log10(meanAmp) * 10) / 10 : -80,
    brightnessHz: Math.round(mean(bright)),
    lowEnd: Math.round(mean(low) * 1000) / 1000,
    onsetDensity: loud.length ? Math.round((onsets.reduce((s, n) => s + n, 0) / loud.length) * 100) / 100 : 0,
    swingDb: Math.round((percentile(sortedLoud, 0.9) - percentile(sortedLoud, 0.1)) * 10) / 10,
  };
}

export function hasWindowData(f: TrackFeatures): boolean {
  return f.second_loudness_db.length > 0;
}

const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

/** Real, window-specific reading for each clickable studio object, each compared against the same
 * measurement taken over the whole track. */
export function readObject(id: StudioObjectId, win: WindowStats, track: WindowStats): StudioReading {
  if (id === "mic") {
    const d = win.loudnessDb - track.loudnessDb;
    return {
      title: "Microphone",
      subject: "Loudness",
      stats: [
        { label: "This section", value: `${win.loudnessDb} dB` },
        { label: "Track average", value: `${track.loudnessDb} dB` },
        { label: "Difference", value: `${signed(d)} dB` },
      ],
      summary:
        d >= 1.5
          ? `${Math.abs(d).toFixed(1)} dB louder than the track average — one of the loud stretches.`
          : d <= -1.5
            ? `${Math.abs(d).toFixed(1)} dB quieter than the track average — a pulled-back stretch.`
            : "Within 1.5 dB of the track average — the level stays close to the rest of the track.",
    };
  }

  if (id === "speaker") {
    const d = win.brightnessHz - track.brightnessHz;
    return {
      title: "Studio Monitor",
      subject: "Mix brightness",
      stats: [
        { label: "This section", value: `${win.brightnessHz} Hz` },
        { label: "Track average", value: `${track.brightnessHz} Hz` },
        { label: "Difference", value: `${signed(d, 0)} Hz` },
      ],
      summary:
        d >= 300
          ? "Brighter than the track average — more high-frequency energy (hats, bright leads) is sitting up front."
          : d <= -300
            ? "Darker than the track average — the high end is pulled back, so low and mid range dominate."
            : "Tonal balance is close to the track average — nothing pulls this stretch brighter or darker.",
    };
  }

  if (id === "amp") {
    const pp = (win.lowEnd - track.lowEnd) * 100;
    return {
      title: "Amp",
      subject: "Low-end weight",
      stats: [
        { label: "This section", value: `${Math.round(win.lowEnd * 100)}%` },
        { label: "Track average", value: `${Math.round(track.lowEnd * 100)}%` },
        { label: "Difference", value: `${signed(pp, 0)} pts` },
      ],
      summary:
        pp >= 8
          ? "Heavier low end than the track average — more of the energy here sits below 150 Hz (808s and sub bass)."
          : pp <= -8
            ? "Lighter low end than the track average — less energy below 150 Hz, so the mids and highs carry more."
            : "Low-end weight is close to the track average — the bass keeps a similar share of the energy.",
    };
  }

  const d = win.swingDb - track.swingDb;
  return {
    title: "Mixer",
    subject: "Level movement",
    stats: [
      { label: "This section", value: `${win.swingDb} dB` },
      { label: "Track average", value: `${track.swingDb} dB` },
      { label: "Rhythm", value: `${win.onsetDensity}/s` },
    ],
    summary:
      d >= 3
        ? "The level moves a lot second to second here — big hits, drops or gaps rather than a flat wall of sound."
        : d <= -3
          ? "The level is steadier than the track average — a more constant, even-loudness stretch."
          : "Level movement is close to the track average.",
  };
}
