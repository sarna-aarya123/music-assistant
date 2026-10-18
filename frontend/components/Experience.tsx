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
import ThemeSwitcher from "@/components/ThemeSwitcher";

// three.js is big and browser-only — each scene loads on demand.
const Loading = ({ text }: { text: string }) => (
  <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-widest text-white/50">
    {text}
  </div>
);
const WaveformWorld = dynamic(() => import("@/components/WaveformWorld"), {
  ssr: false,
  loading: () => <Loading text="Loading waveform..." />,
});
const StudioScene = dynamic(() => import("@/components/StudioScene"), {
  ssr: false,
  loading: () => <Loading text="Creating studio..." />,
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
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#0a0818] p-6 text-center">
        <p className="max-w-md text-sm text-white/80">
          This analysis was saved before the interactive waveform existed. Analyze the track again to
          explore it.
        </p>
        <button
          onClick={onExit}
          className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide"
        >
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
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0a0818]" style={rootStyle}>
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
        className={`pointer-events-none absolute inset-0 z-20 bg-[#0a0818] transition-opacity ${
          phase === "diving" ? "opacity-100 delay-[700ms] duration-700" : "opacity-0 duration-1000"
        }`}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto">
          {phase === "studio" ? (
            <button
              onClick={back}
              className="font-mono text-xs uppercase tracking-widest text-white/70 transition hover:text-white"
            >
              ← Back to waveform
            </button>
          ) : (
            <div className="font-mono text-xs uppercase tracking-widest text-white/70">
              AI Music Assistant
            </div>
          )}
          {features.mood_label && (
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50">
              <span className="h-2 w-2 rounded-full" style={{ background: mood ?? "#fff" }} />
              Mood: {features.mood_label} (estimated)
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="font-mono text-xs uppercase tracking-widest text-white/70 transition hover:text-white"
          >
            Track info
          </button>
          <ThemeSwitcher />
          <button
            onClick={onExit}
            className="font-mono text-xs uppercase tracking-widest text-white/70 transition hover:text-white"
          >
            New track
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="absolute right-4 top-16 z-30 w-60 rounded-xl border border-white/15 bg-[#0c0a1e]/90 p-3 backdrop-blur">
          <dl className="space-y-1">
            {statRows.map(([label, value]) => (
              <div key={label} className="flex justify-between font-mono text-xs">
                <dt className="uppercase tracking-widest text-white/50">{label}</dt>
                <dd className="font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Portrait: the selected object's readout as a bottom sheet. */}
      {phase === "studio" && portrait && selected && readings && (
        <div className="absolute inset-x-3 bottom-14 z-30 rounded-xl border border-white/15 bg-[#0c0a1e]/90 p-3 backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/50">{readings[selected].title}</div>
          <div className="mb-2 font-display text-base uppercase tracking-wide text-accent">{readings[selected].subject}</div>
          <dl className="mb-2 space-y-1">
            {readings[selected].stats.map((st) => (
              <div key={st.label} className="flex justify-between font-mono text-xs">
                <dt className="uppercase tracking-widest text-white/50">{st.label}</dt>
                <dd className="font-semibold text-white">{st.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-snug text-white/90">{readings[selected].summary}</p>
        </div>
      )}

      {/* Bottom hint / controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 p-4">
        {phase === "waveform" && (
          <div className="font-mono text-xs uppercase tracking-widest text-white/60">
            {hover
              ? `${fmtTime(hover.start)} – ${fmtTime(hover.end)} · click to step into the studio`
              : "Hover to preview 30 seconds · click anywhere to step in"}
          </div>
        )}
        {phase === "studio" && win && (
          <>
            <div className="font-mono text-xs uppercase tracking-widest text-white/60">
              {fmtTime(win.start)} – {fmtTime(win.end)} ·{" "}
              {selected ? "click empty space to look around" : "click the mic, monitor, mixer or amp"}
            </div>
            {audioUrl && (
              <button
                onClick={togglePlay}
                className="pointer-events-auto bg-accent px-4 py-2 text-xs font-medium uppercase tracking-wide"
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
