"use client";

import { useState } from "react";
import type { TrackSegment } from "@/lib/api";

type SongMapProps = {
  energyCurve: number[];
  segments: TrackSegment[];
  durationSec: number;
};

// Even the loudest bin only fills this much of the panel — keeps headroom above the bars instead
// of them slamming the ceiling, same idea as WaveformExplorer's PEAK_CAP.
const PEAK_CAP = 0.85;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Full-track "song map": the whole track's loudness curve as one long bar chart, with a pin at
 * every algorithmically-detected structural mark. Clicking a pin zooms into a "studio" deep-dive
 * for that section — a real per-window feature readout, not the whole-track aggregate. */
export default function SongMap({ energyCurve, segments, durationSec }: SongMapProps) {
  const [selected, setSelected] = useState<TrackSegment | null>(null);
  const [originPct, setOriginPct] = useState(50);

  function openSegment(seg: TrackSegment) {
    setOriginPct(durationSec > 0 ? (seg.mark_sec / durationSec) * 100 : 50);
    setSelected(seg);
  }

  const segmentSlice = selected
    ? energyCurve.slice(
        Math.floor((selected.start_sec / durationSec) * energyCurve.length),
        Math.max(
          Math.ceil((selected.end_sec / durationSec) * energyCurve.length),
          Math.floor((selected.start_sec / durationSec) * energyCurve.length) + 4
        )
      )
    : [];

  return (
    <div className="hud-panel relative overflow-hidden border border-border bg-surface p-4">
      {/* Full-song overview */}
      <div
        className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          selected ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-mono text-xs uppercase tracking-widest text-accent2">Song Map</h3>
          <span className="font-mono text-xs text-muted">Click a mark for an in-depth read on that section</span>
        </div>
        <div className="relative h-40 w-full">
          <div className="flex h-full w-full items-end gap-px">
            {energyCurve.map((v, i) => (
              <div
                key={i}
                className="animate-pop-in min-w-[1px] flex-1 rounded-t-sm bg-gradient-to-t from-accent to-accent2"
                style={{
                  height: `${Math.max(3, v * PEAK_CAP * 100)}%`,
                  animationDelay: `${Math.min(i * 1.5, 400)}ms`,
                }}
              />
            ))}
          </div>
          {segments.map((seg, i) => {
            const leftPct = durationSec > 0 ? (seg.mark_sec / durationSec) * 100 : 0;
            return (
              <button
                key={i}
                onClick={() => openSegment(seg)}
                title={`${formatTime(seg.start_sec)} – ${formatTime(seg.end_sec)}`}
                className="group absolute bottom-0 top-0 flex w-4 -translate-x-1/2 items-start justify-center"
                style={{ left: `${leftPct}%` }}
              >
                <span className="mt-[-6px] h-3 w-3 rotate-45 rounded-sm bg-gold shadow-glow transition-transform group-hover:scale-125 group-active:scale-90" />
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>0:00</span>
          <span>{formatTime(durationSec)}</span>
        </div>
      </div>

      {/* Studio deep-dive — only meaningfully populated once a mark's been clicked, but always
          mounted so the CSS transition above has something to animate into. */}
      <div
        className={`absolute inset-0 flex flex-col p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          selected ? "scale-100 opacity-100" : "pointer-events-none scale-110 opacity-0"
        }`}
        style={{ transformOrigin: `${originPct}% 50%` }}
      >
        {selected && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-widest text-accent2">Studio</h3>
                <p className="font-display text-lg uppercase tracking-wide text-ink">
                  {formatTime(selected.start_sec)} – {formatTime(selected.end_sec)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="font-mono text-xs uppercase tracking-widest text-muted transition hover:text-accent2"
              >
                ← Back to full song
              </button>
            </div>

            <div className="mb-3 flex h-16 items-end gap-px">
              {segmentSlice.map((v, i) => (
                <div
                  key={i}
                  className="min-w-[2px] flex-1 rounded-t-sm bg-gradient-to-t from-accent to-gold"
                  style={{ height: `${Math.max(4, v * PEAK_CAP * 100)}%` }}
                />
              ))}
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat label="Loudness" value={`${selected.features.rms_db} dB`} />
              <MiniStat label="Brightness" value={`${Math.round(selected.features.brightness_hz)} Hz`} />
              <MiniStat label="Onset Density" value={`${selected.features.onset_density}/s`} />
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto">
              {selected.notes.map((note, i) => (
                <div
                  key={i}
                  className="rounded-xl border-l-4 border-accent2 bg-background/40 px-3 py-2 text-sm text-ink"
                >
                  {note}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-2 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold text-accent2">{value}</div>
    </div>
  );
}
