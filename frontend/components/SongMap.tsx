"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { TrackFeatures, TrackSegment } from "@/lib/api";
import { useThemeColors } from "@/lib/themeColors";
import { normalizeForScene, readObject, type StudioObjectId } from "@/lib/studioInfo";
import AiProducerPanel from "@/components/AiProducerPanel";

// three.js is large and only needed once a mark is opened, so it loads on demand (browser only).
const StudioScene = dynamic(() => import("@/components/StudioScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-xs text-muted">
      Creating studio...
    </div>
  ),
});

type SongMapProps = {
  trackId: string;
  track: TrackFeatures;
  energyCurve: number[];
  segments: TrackSegment[];
  durationSec: number;
};

// Even the loudest bin only fills this much of the panel — keeps headroom above the bars instead
// of them slamming the ceiling, same idea as WaveformExplorer's PEAK_CAP.
const PEAK_CAP = 0.85;

const OBJECTS: { id: StudioObjectId; label: string }[] = [
  { id: "monitor", label: "Studio Monitor" },
  { id: "mic", label: "Microphone" },
  { id: "drums", label: "Drum Machine" },
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Full-track "song map": the whole track's loudness curve as one long bar chart, with a pin at
 * every algorithmically-detected structural mark. Clicking a pin zooms into a 3D "studio" for that
 * section — click the monitor, microphone or drum machine for a real per-window readout. */
export default function SongMap({ trackId, track, energyCurve, segments, durationSec }: SongMapProps) {
  const [selected, setSelected] = useState<TrackSegment | null>(null);
  const [object, setObject] = useState<StudioObjectId | null>(null);
  const [originPct, setOriginPct] = useState(50);
  const colors = useThemeColors();

  function openSegment(seg: TrackSegment) {
    setOriginPct(durationSec > 0 ? (seg.mark_sec / durationSec) * 100 : 50);
    setObject(null);
    setSelected(seg);
  }

  function closeSegment() {
    setSelected(null);
    setObject(null);
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

  const reading = selected && object ? readObject(object, selected.features, track) : null;
  const scene = selected ? normalizeForScene(selected.features) : null;

  return (
    <div
      className={`hud-panel relative overflow-hidden border border-border bg-surface p-4 transition-[min-height] duration-500 ${
        selected ? "min-h-[58rem] lg:min-h-[40rem]" : "min-h-[16rem]"
      }`}
    >
      {/* Full-song overview */}
      <div
        className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          selected ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-mono text-xs uppercase tracking-widest text-accent2">Song Map</h3>
          <span className="font-mono text-xs text-muted">Click a mark to step into the studio for that section</span>
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

      {/* Studio — always mounted so the CSS transition above has something to animate into, but the
          WebGL scene itself only exists while a section is open. */}
      <div
        className={`absolute inset-0 flex flex-col p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          selected ? "scale-100 opacity-100" : "pointer-events-none scale-110 opacity-0"
        }`}
        style={{ transformOrigin: `${originPct}% 50%` }}
      >
        {selected && scene && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-widest text-accent2">Studio</h3>
                <p className="font-display text-lg uppercase tracking-wide text-ink">
                  {formatTime(selected.start_sec)} – {formatTime(selected.end_sec)}
                </p>
              </div>
              <button
                onClick={closeSegment}
                className="font-mono text-xs uppercase tracking-widest text-muted transition hover:text-accent2"
              >
                ← Back to full song
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_21rem]">
              <div className="relative min-h-[18rem] overflow-hidden rounded-xl border border-border bg-background/60">
                <StudioScene
                  selected={object}
                  onSelect={setObject}
                  loudness01={scene.loudness01}
                  brightness01={scene.brightness01}
                  density01={scene.density01}
                  colors={colors}
                />
                <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {object ? "Click empty space to look around" : "Click the monitor, microphone or drum machine"}
                </div>
                {object && (
                  <button
                    onClick={() => setObject(null)}
                    className="absolute right-3 top-3 rounded-lg border border-border bg-surface/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted transition hover:text-accent2"
                  >
                    Look around
                  </button>
                )}
              </div>

              <div className="min-h-0 space-y-2 overflow-y-auto">
                {reading ? (
                  <div className="rounded-xl border border-accent2/40 bg-background/40 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{reading.title}</div>
                    <div className="mb-2 font-display text-base uppercase tracking-wide text-accent2">
                      {reading.subject}
                    </div>
                    <dl className="mb-2 space-y-1">
                      {reading.stats.map((s) => (
                        <div key={s.label} className="flex justify-between font-mono text-xs">
                          <dt className="uppercase tracking-widest text-muted">{s.label}</dt>
                          <dd className="font-semibold text-ink">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-sm text-ink">{reading.summary}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {OBJECTS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setObject(o.id)}
                        className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 text-left transition hover:border-accent2"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{o.label}</div>
                        <div className="font-mono text-sm font-semibold text-accent2">
                          {readObject(o.id, selected.features, track).subject}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex h-10 items-end gap-px">
                  {segmentSlice.map((v, i) => (
                    <div
                      key={i}
                      className="min-w-[2px] flex-1 rounded-t-sm bg-gradient-to-t from-accent to-gold"
                      style={{ height: `${Math.max(4, v * PEAK_CAP * 100)}%` }}
                    />
                  ))}
                </div>

                {selected.notes.map((note, i) => (
                  <div
                    key={i}
                    className="rounded-xl border-l-4 border-accent2 bg-background/40 px-3 py-2 text-sm text-ink"
                  >
                    {note}
                  </div>
                ))}
                <AiProducerPanel trackId={trackId} segmentIndex={segments.indexOf(selected)} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
