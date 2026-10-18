"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import type { TrackFeatures } from "@/lib/api";
import { moodColor, moodTriplet } from "@/lib/mood";
import { useThemeColors } from "@/lib/themeColors";
import {
  fmtTime,
  hasWindowData,
  readObject,
  statsFor,
  type StudioObjectId,
  type TimeWindow,
} from "@/lib/windowStats";

// three.js is big and browser-only — each scene loads on demand.
const Loading = ({ text }: { text: string }) => (
  <div className="flex h-full w-full items-center justify-center font-display text-3xl italic text-muted">
    {text}
  </div>
);
const WaveformWorld = dynamic(() => import("@/components/WaveformWorld"), {
  ssr: false,
  loading: () => <Loading text="Loading waveform…" />,
});
const StudioScene = dynamic(() => import("@/components/StudioScene"), {
  ssr: false,
  loading: () => <Loading text="Creating studio…" />,
});

// Matches DIVE_MS in WaveformWorld (kept as a literal so importing it doesn't pull three.js in
// eagerly): how long the camera dive takes before the studio takes over.
const DIVE_MS = 1400;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Phase = "waveform" | "diving" | "studio";

type ExperienceProps = {
  features: TrackFeatures;
  durationSec: number;
  /** The uploaded audio, for playing a section. Absent for past analyses reopened from history. */
  file: File | null;
  onExit: () => void;
};

/** The whole post-analysis screen: a 3D waveform of the full track -> click anywhere to dive into a
 * ~30s span -> a 3D studio for just that span, where each object reports on its own measurement. */
export default function Experience(props: ExperienceProps) {
  // Rendered into <body> so it covers the whole screen, including the site's nav — the layout
  // wrapper creates its own stacking layer that a plain fixed element can't escape. Only ever
  // mounted after an analysis finishes (never during server render), so `document` exists.
  return createPortal(<ExperienceInner {...props} />, document.body);
}

function ExperienceInner({ features, durationSec, file, onExit }: ExperienceProps) {
  const colors = useThemeColors();
  const [phase, setPhase] = useState<Phase>("waveform");
  const [hover, setHover] = useState<TimeWindow | null>(null);
  const [win, setWin] = useState<TimeWindow | null>(null);
  const [selected, setSelected] = useState<StudioObjectId | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const diveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Lock the page behind the full-screen view so it can't scroll under it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Portrait screens (phones) have no room beside an object for a card, so they get a bottom sheet.
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerWidth / window.innerHeight < 1.1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (diveTimer.current) clearTimeout(diveTimer.current);
    };
  }, [audioUrl]);

  const mood = moodColor(features.mood_label);
  const moodVar = moodTriplet(features.mood_label);

  const trackStats = useMemo(
    () => statsFor(features, { start: 0, end: durationSec }),
    [features, durationSec]
  );
  const winStats = useMemo(() => (win ? statsFor(features, win) : null), [features, win]);
  const readings = useMemo(() => {
    if (!winStats) return null;
    return {
      mic: readObject("mic", winStats, trackStats),
      speaker: readObject("speaker", winStats, trackStats),
      amp: readObject("amp", winStats, trackStats),
      mixer: readObject("mixer", winStats, trackStats),
    };
  }, [winStats, trackStats]);

  function pick(w: TimeWindow) {
    setWin(w);
    setSelected(null);
    setPhase("diving");
    diveTimer.current = setTimeout(() => setPhase("studio"), DIVE_MS);
  }

  function back() {
    stopAudio();
    if (diveTimer.current) clearTimeout(diveTimer.current);
    setPhase("waveform");
    setWin(null);
    setHover(null);
    setSelected(null);
  }

  function stopAudio() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a || !win) return;
    if (playing) {
      stopAudio();
      return;
    }
    a.currentTime = win.start;
    void a.play();
    setPlaying(true);
  }

  // The root carries the mood as a CSS variable so the tint layer (and anything else) can use it.
  const rootStyle = (moodVar ? { "--mood-rgb": moodVar } : {}) as React.CSSProperties;

  if (!hasWindowData(features)) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="max-w-md font-display text-3xl leading-tight">
          This analysis was saved before the interactive waveform existed.
        </p>
        <p className="max-w-md text-muted">Analyze the track again to explore it.</p>
        <button onClick={onExit} className="mt-2 bg-accent px-5 py-3 text-[15px] font-medium text-surface transition hover:bg-ink">
          Analyze a track
        </button>
      </div>
    );
  }

  const statRows: [string, string][] = [
    ["BPM", String(features.bpm)],
    ["Key", features.key],
    ["Loudness", `${features.rms_db} dB`],
    ["Brightness", `${Math.round(features.brightness_hz)} Hz`],
    ["Dynamic range", `${features.dynamic_range_db} dB`],
    // Same per-second average the amp card compares against, so the two never disagree.
    ["Low-end (avg)", `${Math.round(trackStats.lowEnd * 100)}%`],
    ["Onsets", `${features.onset_density}/s`],
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-background" style={rootStyle}>
      {/* Scenes */}
      {phase !== "studio" && (
        <div className="absolute inset-0">
          <WaveformWorld
            loudnessDb={features.second_loudness_db}
            brightnessHz={features.second_brightness_hz}
            durationSec={durationSec}
            colors={colors}
            mood={mood}
            onHover={setHover}
            diveTo={phase === "diving" ? win : null}
            onPick={pick}
          />
        </div>
      )}
      {phase === "studio" && readings && winStats && (
        <div className="absolute inset-0">
          <StudioScene
            selected={selected}
            onSelect={setSelected}
            levels={{
              loudness01: clamp01((winStats.loudnessDb + 30) / 30),
              brightness01: clamp01((winStats.brightnessHz - 500) / 4500),
              lowEnd01: clamp01(winStats.lowEnd),
              swing01: clamp01(winStats.swingDb / 30),
            }}
            readings={readings}
            colors={colors}
            mood={mood}
            hideCards={portrait}
          />
        </div>
      )}

      {/* Slight mood wash over everything, keyed so a new mood fades in. */}
      {moodVar && <div key={features.mood_label} className="mood-tint" />}

      {/* Dive/arrive fade: dark by the end of the dive, then clears once the studio is up. */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 bg-background transition-opacity ${
          phase === "diving" ? "opacity-100 delay-[700ms] duration-700" : "opacity-0 duration-1000"
        }`}
      />

      {/* Soft paper fades so the text stays readable over any part of the scene. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-32 bg-gradient-to-b from-background/90 via-background/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-background/90 via-background/50 to-transparent" />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-5">
        <div className="pointer-events-auto">
          {phase === "studio" ? (
            <button onClick={back} className="text-[15px] underline-offset-4 transition hover:underline">
              ← Back to the waveform
            </button>
          ) : (
            <div className="font-display text-2xl leading-none">AI Music Assistant</div>
          )}
          {features.mood_label && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">
              <span className="inline-block h-2.5 w-2.5" style={{ background: mood ?? "currentColor" }} />
              Feels {features.mood_label.toLowerCase()} <span className="opacity-70">· estimated</span>
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-[15px]">
          <button onClick={() => setShowInfo((v) => !v)} className="underline-offset-4 transition hover:underline">
            Track info
          </button>
          <button onClick={onExit} className="underline-offset-4 transition hover:underline">
            New track
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="absolute right-5 top-14 z-30 w-60 border border-ink/70 bg-surface p-4 shadow-[0_14px_30px_-18px_rgba(22,20,15,0.6)]">
          <dl className="space-y-1">
            {statRows.map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="num font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Portrait: the selected object's readout as a bottom sheet. */}
      {phase === "studio" && portrait && selected && readings && (
        <div className="absolute inset-x-3 bottom-16 z-30 border border-ink/70 bg-surface p-4 shadow-[0_14px_30px_-18px_rgba(22,20,15,0.6)]">
          <div className="text-xs text-muted">{readings[selected].title}</div>
          <div className="font-display text-2xl leading-tight">{readings[selected].subject}</div>
          <dl className="my-2 space-y-0.5 border-y border-ink/15 py-2">
            {readings[selected].stats.map((st) => (
              <div key={st.label} className="flex justify-between text-sm">
                <dt className="text-muted">{st.label}</dt>
                <dd className="num font-medium">{st.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[15px] leading-snug">{readings[selected].summary}</p>
        </div>
      )}

      {/* Bottom hint / controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 p-5">
        {phase === "waveform" && (
          <div className="font-display text-xl italic text-muted sm:text-2xl">
            {hover ? (
              <>
                <span className="num not-italic text-ink">
                  {fmtTime(hover.start)} – {fmtTime(hover.end)}
                </span>{" "}
                · click to step in
              </>
            ) : (
              "Hover to preview 30 seconds. Click anywhere to step in."
            )}
          </div>
        )}
        {phase === "studio" && win && (
          <>
            <div className="font-display text-xl italic text-muted sm:text-2xl">
              <span className="num not-italic text-ink">
                {fmtTime(win.start)} – {fmtTime(win.end)}
              </span>{" "}
              · {selected ? "click empty space to look around" : "click the mic, monitor, mixer or amp"}
            </div>
            {audioUrl && (
              <button
                onClick={togglePlay}
                className="pointer-events-auto bg-ink px-5 py-3 text-[15px] font-medium text-surface transition hover:bg-accent"
              >
                {playing ? "Stop" : "Play this section"}
              </button>
            )}
          </>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(e) => {
            if (win && e.currentTarget.currentTime >= win.end) stopAudio();
          }}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
