"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import type { TrackFeatures } from "@/lib/api";
import { moodColor } from "@/lib/mood";
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
  <div className="flex h-full w-full items-center justify-center bg-black text-white">
    <span className="cursor">{text}</span>
  </div>
);
const WaveformWorld = dynamic(() => import("@/components/WaveformWorld"), {
  ssr: false,
  loading: () => <Loading text="loading waveform" />,
});
const StudioScene = dynamic(() => import("@/components/StudioScene"), {
  ssr: false,
  loading: () => <Loading text="creating studio" />,
});

// Matches DIVE_MS in WaveformWorld (kept as a literal so importing it doesn't pull three.js in
// eagerly): how long the camera dive takes before the studio takes over.
const DIVE_MS = 1400;

type Phase = "waveform" | "diving" | "studio";

// The one piece of 2D chrome: a small black label with white type, like a sticker on a machine.
const CHIP = "bg-black px-3 py-1.5 text-[13px] leading-none text-white";
const CHIP_BUTTON = `${CHIP} transition hover:bg-accent`;

type ExperienceProps = {
  features: TrackFeatures;
  durationSec: number;
  /** The uploaded audio, for playing a section. Absent for past analyses reopened from history. */
  file: File | null;
  onExit: () => void;
};

/** The whole post-analysis screen: a 3D waveform of the full track -> click anywhere to dive into a
 * ~30s span -> a desk diorama for just that span, where each object reports on its own measurement. */
export default function Experience(props: ExperienceProps) {
  // Rendered into <body> so it covers the whole screen — the layout wrapper creates its own stacking
  // layer that a plain fixed element can't escape. Only ever mounted after an analysis finishes
  // (never during server render), so `document` exists.
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

  const trackStats = useMemo(() => statsFor(features, { start: 0, end: durationSec }), [features, durationSec]);
  const winStats = useMemo(() => (win ? statsFor(features, win) : null), [features, win]);
  const readings = useMemo(() => {
    if (!winStats) return null;
    return {
      cassette: readObject("cassette", winStats, trackStats),
      radio: readObject("radio", winStats, trackStats),
      boombox: readObject("boombox", winStats, trackStats),
      tv: readObject("tv", winStats, trackStats),
    };
  }, [winStats, trackStats]);
  const tvCurveDb = useMemo(
    () => (win ? features.second_loudness_db.slice(Math.floor(win.start), Math.ceil(win.end)) : []),
    [features, win]
  );

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

  if (!hasWindowData(features)) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-black p-6 text-center text-white">
        <div className="max-w-sm border border-white p-6">
          <p>This analysis was saved before the interactive waveform existed.</p>
          <p className="mt-3 text-muted">Analyze the track again to explore it.</p>
        </div>
        <button onClick={onExit} className={CHIP_BUTTON}>
          [ analyze a track ]
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
    // Same per-second average the boombox card compares against, so the two never disagree.
    ["Low-end (avg)", `${Math.round(trackStats.lowEnd * 100)}%`],
    ["Onsets", `${features.onset_density}/s`],
  ];

  const sheet = phase === "studio" && portrait && selected && readings ? readings[selected] : null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
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
      {phase === "studio" && readings && win && (
        <div className="absolute inset-0">
          <StudioScene
            selected={selected}
            onSelect={setSelected}
            readings={readings}
            tvCurveDb={tvCurveDb}
            tvLabel={`${fmtTime(win.start)}-${fmtTime(win.end)}`}
            colors={colors}
            mood={mood}
            hideCards={portrait}
          />
        </div>
      )}

      {/* Dip to black on the way from the waveform into the studio. */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 bg-black transition-opacity ${
          phase === "diving" ? "opacity-100 delay-[700ms] duration-700" : "opacity-0 duration-1000"
        }`}
      />

      {/* Top left */}
      <div className="pointer-events-none absolute left-5 top-5 z-30 flex flex-col items-start gap-2">
        {phase === "studio" ? (
          <button onClick={back} className={`pointer-events-auto ${CHIP_BUTTON}`}>
            ← back to waveform
          </button>
        ) : (
          <div className={CHIP}>AI Music Assistant</div>
        )}
        {features.mood_label && (
          <div className={`${CHIP} flex items-center gap-2`}>
            <span className="inline-block h-2.5 w-2.5" style={{ background: mood ?? "#fff" }} />
            feels {features.mood_label.toLowerCase()} (estimated)
          </div>
        )}
      </div>

      {/* Top right */}
      <div className="pointer-events-none absolute right-5 top-5 z-30 flex flex-wrap items-start justify-end gap-2">
        <button onClick={() => setShowInfo((v) => !v)} className={`pointer-events-auto ${CHIP_BUTTON}`}>
          track info
        </button>
        <button onClick={onExit} className={`pointer-events-auto ${CHIP_BUTTON}`}>
          new track
        </button>
      </div>

      {showInfo && (
        <div className="absolute right-5 top-16 z-30 w-60 border border-white bg-black p-3 text-[13px] text-white">
          <dl className="space-y-0.5">
            {statRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-dashed border-white/25 pb-0.5 last:border-0">
                <dt className="text-white/60">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Portrait: the selected object's readout as a bottom sheet. */}
      {sheet && (
        <div className="absolute inset-x-3 bottom-16 z-30 border border-white bg-black p-3 text-[13px] leading-snug text-white">
          <div className="text-white/60">{sheet.title}</div>
          <div className="mb-2 text-base font-bold">{sheet.subject}</div>
          <dl className="mb-2 space-y-0.5 border-y border-dashed border-white/30 py-2">
            {sheet.stats.map((st) => (
              <div key={st.label} className="flex justify-between gap-3">
                <dt className="text-white/60">{st.label}</dt>
                <dd>{st.value}</dd>
              </div>
            ))}
          </dl>
          <p>{sheet.summary}</p>
        </div>
      )}

      {/* Bottom */}
      <div className="pointer-events-none absolute inset-x-5 bottom-5 z-30 flex items-end justify-between gap-3">
        {phase === "waveform" && (
          <div className={CHIP}>
            {hover ? (
              <>
                {fmtTime(hover.start)} - {fmtTime(hover.end)} · click to step in
              </>
            ) : (
              "hover to preview 30 seconds · click to step in"
            )}
          </div>
        )}
        {phase === "studio" && win && (
          <>
            <div className={CHIP}>
              {fmtTime(win.start)} - {fmtTime(win.end)} · {selected ? "click empty space to look around" : "click an object"}
            </div>
            {audioUrl && (
              <button onClick={togglePlay} className={`pointer-events-auto ${CHIP_BUTTON}`}>
                {playing ? "[ stop ]" : "[ play this section ]"}
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
