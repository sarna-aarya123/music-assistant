import type { SegmentFeatures, TrackFeatures } from "@/lib/api";

export type StudioObjectId = "monitor" | "mic" | "drums";

export type StudioReading = {
  title: string;
  /** What the object stands for, e.g. "Loudness". */
  subject: string;
  stats: { label: string; value: string }[];
  /** Plain-language read, built from the numbers above by threshold rules — no model involved. */
  summary: string;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Maps a section's measurements onto 0-1 so the 3D props can react to them. */
export function normalizeForScene(f: SegmentFeatures) {
  return {
    loudness01: clamp01((f.rms_db + 30) / 30), // -30 dB (quiet) .. 0 dB (full scale)
    brightness01: clamp01((f.brightness_hz - 500) / 4500), // 500 Hz (dark) .. 5 kHz (bright)
    density01: clamp01(f.onset_density / 6), // 0 .. 6 hits per second
  };
}

function signed(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
}

/** Real, section-specific reading for each clickable studio object. Everything compares the
 * section's own measurements against the whole-track values. */
export function readObject(id: StudioObjectId, seg: SegmentFeatures, track: TrackFeatures): StudioReading {
  if (id === "mic") {
    const d = seg.rms_db - track.rms_db;
    const summary =
      d >= 1.5
        ? `${Math.abs(d).toFixed(1)} dB louder than the track average — one of the loud moments.`
        : d <= -1.5
          ? `${Math.abs(d).toFixed(1)} dB quieter than the track average — a pulled-back section.`
          : "Within 1.5 dB of the track average — the level stays steady through here.";
    return {
      title: "Microphone",
      subject: "Loudness",
      stats: [
        { label: "This section", value: `${seg.rms_db} dB` },
        { label: "Track average", value: `${track.rms_db} dB` },
        { label: "Difference", value: `${signed(d)} dB` },
      ],
      summary,
    };
  }

  if (id === "monitor") {
    const d = seg.brightness_hz - track.brightness_hz;
    const summary =
      d >= 300
        ? "Brighter than the track average — more high-frequency energy, like hats and bright leads, is sitting up front."
        : d <= -300
          ? "Darker than the track average — the high end is pulled back, so the low and mid range dominate."
          : "Tonal balance is close to the track average — nothing is pulling this section brighter or darker.";
    return {
      title: "Studio Monitor",
      subject: "Mix brightness",
      stats: [
        { label: "This section", value: `${Math.round(seg.brightness_hz)} Hz` },
        { label: "Track average", value: `${Math.round(track.brightness_hz)} Hz` },
        { label: "Difference", value: `${signed(d, 0)} Hz` },
        { label: "Zero-crossing", value: `${seg.zero_crossing_rate}` },
      ],
      summary,
    };
  }

  const d = seg.onset_density - track.onset_density;
  const beatsPerSec = track.bpm / 60;
  const perBeat = beatsPerSec > 0 ? seg.onset_density / beatsPerSec : 0;
  const summary =
    d >= 0.5
      ? `Busier than the track average — about ${perBeat.toFixed(1)} hits per beat, so the rhythm is more active here.`
      : d <= -0.5
        ? `Sparser than the track average — about ${perBeat.toFixed(1)} hits per beat, so the rhythm opens up.`
        : `Rhythm density matches the track average — about ${perBeat.toFixed(1)} hits per beat.`;
  return {
    title: "Drum Machine",
    subject: "Rhythm density",
    stats: [
      { label: "This section", value: `${seg.onset_density}/s` },
      { label: "Track average", value: `${track.onset_density}/s` },
      { label: "Hits per beat", value: perBeat.toFixed(1) },
    ],
    summary,
  };
}
