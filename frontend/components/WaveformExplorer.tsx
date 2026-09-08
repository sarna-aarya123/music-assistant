"use client";

import { useEffect, useRef, useState } from "react";

type WaveformExplorerProps = {
  file: File;
  durationSec: number;
  onsetTimes: number[];
  beatTimes: number[];
};

type AudioGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array;
};

const BAR_COUNT = 64;
// Even a maxed-out reading tops out at this fraction of the panel's height, so a dense/loud
// section doesn't slam every bar into the ceiling — leaves visible headroom at all times.
const PEAK_CAP = 0.75;

type ThemeColors = { accent: string; accent2: string; gold: string; ink: string };

/** Canvas fillStyle/strokeStyle need a literal resolved color, unlike regular CSS which can read
 * a `var(--x)` directly — so the current colorway's variables are read here and cached, refreshed
 * whenever ThemeSwitcher fires the "themechange" event (see components/ThemeSwitcher.tsx). */
function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.documentElement);
  const rgb = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value ? `rgb(${value.replace(/\s+/g, ",")})` : fallback;
  };
  return {
    accent: rgb("--color-accent", "#ff5a36"),
    accent2: rgb("--color-accent2", "#2dd4bf"),
    gold: rgb("--color-gold", "#ffb020"),
    ink: rgb("--color-ink", "#f3eeff"),
  };
}

export default function WaveformExplorer({ file, durationSec, onsetTimes, beatTimes }: WaveformExplorerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioGraphRef = useRef<AudioGraph | null>(null);
  const beatTimesRef = useRef<number[]>(beatTimes);
  const onsetTimesRef = useRef<number[]>(onsetTimes);
  const lastTimeRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Spring-animated bar heights (jelly/bouncy motion) — current value + velocity per bar, eased
  // toward a target each frame rather than snapping straight to it.
  const barCurrentRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const barVelocityRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const beatBoostRef = useRef(0);
  const themeRef = useRef<ThemeColors>({ accent: "#ff5a36", accent2: "#2dd4bf", gold: "#ffb020", ink: "#f3eeff" });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    beatTimesRef.current = beatTimes;
  }, [beatTimes]);

  useEffect(() => {
    onsetTimesRef.current = onsetTimes;
  }, [onsetTimes]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Just wires up playback (an object URL for the <audio> element) — no full decode needed since
  // there's no amplitude waveform to draw anymore, only the live reactive bars.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Close the live-analysis audio graph (if one was ever created) when this explorer goes away.
  useEffect(() => {
    return () => {
      audioGraphRef.current?.ctx.close();
    };
  }, []);

  // Cache the active colorway's resolved colors for canvas use, refreshing on theme switch.
  useEffect(() => {
    themeRef.current = readThemeColors();
    const onThemeChange = () => {
      themeRef.current = readThemeColors();
    };
    window.addEventListener("themechange", onThemeChange);
    return () => window.removeEventListener("themechange", onThemeChange);
  }, []);

  /** Live, bouncy frequency bars — the whole visual. Each bar springs toward a target height (the
   * live analyser reading while playing, or a slow idle undulation while paused) instead of
   * snapping straight to it — that overshoot-and-settle is what reads as "cartoon" bounce rather
   * than a flat technical meter. A shared `beatBoost` jolts every bar on each detected beat. */
  function draw(time: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const currentTime = audioRef.current?.currentTime ?? 0;
    const theme = themeRef.current;

    // Beat grid — thin lines in the theme's secondary accent, drawn behind the bars.
    ctx.strokeStyle = theme.accent2;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for (const t of beatTimesRef.current) {
      const x = (t / durationSec) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Onset markers — small ticks in the theme's gold accent, along the top.
    ctx.fillStyle = theme.gold;
    for (const t of onsetTimesRef.current) {
      const x = (t / durationSec) * width;
      ctx.fillRect(x - 1, 0, 2, 8);
    }

    const graph = audioGraphRef.current;
    const playing = isPlayingRef.current;
    if (playing && graph) graph.analyser.getByteFrequencyData(graph.data);

    beatBoostRef.current *= 0.88; // decays every frame — the "thump" fades out after each beat

    const barWidth = width / BAR_COUNT;
    const current = barCurrentRef.current;
    const velocity = barVelocityRef.current;

    for (let i = 0; i < BAR_COUNT; i++) {
      let target: number;
      if (playing && graph) {
        const step = Math.max(1, Math.floor(graph.data.length / BAR_COUNT));
        let sum = 0;
        for (let j = 0; j < step; j++) sum += graph.data[i * step + j];
        target = sum / step / 255;
      } else {
        // Idle breathing — a slow traveling wave across the bars so it's never fully static.
        target = 0.12 + 0.09 * Math.sin(time * 0.0016 + i * 0.35);
      }
      target = Math.min(1, target + beatBoostRef.current);

      // Critically-damped-ish spring: pulls toward target, slight overshoot before settling.
      const force = (target - current[i]) * 0.35;
      velocity[i] = (velocity[i] + force) * 0.78;
      current[i] += velocity[i];
      if (current[i] < 0) current[i] = 0;

      const barHeight = Math.max(3, current[i] * height * PEAK_CAP);
      const x = i * barWidth + 1;
      const w = Math.max(1, barWidth - 2);
      const y = height - barHeight;
      const radius = Math.min(w / 2, 6);

      ctx.fillStyle = current[i] > 0.75 ? theme.gold : current[i] > 0.4 ? theme.accent2 : theme.accent;
      ctx.globalAlpha = 0.35 + current[i] * 0.5;
      ctx.beginPath();
      ctx.roundRect(x, y, w, barHeight, radius);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Playhead, on top of everything.
    const playheadX = (currentTime / durationSec) * width;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }

  /** Briefly bounces the whole panel — triggered when playback crosses a detected beat. */
  function triggerBeatPulse() {
    beatBoostRef.current = 0.55;
    const el = pulseRef.current;
    if (!el) return;
    el.style.transform = "scale(1.008)";
    window.setTimeout(() => {
      el.style.transform = "";
    }, 30);
  }

  function checkBeatCross(currentTime: number) {
    const prev = lastTimeRef.current;
    if (currentTime < prev) {
      lastTimeRef.current = currentTime;
      return; // seeked backward — don't replay pulses for beats we're now before
    }
    const crossed = beatTimesRef.current.some((t) => t > prev && t <= currentTime);
    if (crossed) triggerBeatPulse();
    lastTimeRef.current = currentTime;
  }

  // One continuous animation loop for the whole component's life — always animating (idle
  // breathing when paused, reactive + beat-synced when playing). Resize is handled implicitly
  // since draw reads clientWidth/clientHeight each frame.
  useEffect(() => {
    const tick = (time: number) => {
      draw(time);
      if (isPlayingRef.current) checkBeatCross(audioRef.current?.currentTime ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seekFromClientX(clientX: number) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = fraction * durationSec;
    lastTimeRef.current = audio.currentTime;
  }

  /** Lazily wires the <audio> element through an AnalyserNode — done once per component instance
   * (not per file: re-creating a MediaElementSource on the same element throws), on a real user
   * gesture (the play click), which also satisfies the browser's autoplay-audio-context policy. */
  function ensureAudioGraph() {
    if (audioGraphRef.current || !audioRef.current) return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination); // must reconnect to destination or playback goes silent
    audioGraphRef.current = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      ensureAudioGraph();
      audioGraphRef.current?.ctx.resume();
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  return (
    <div className="hud-panel border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={!objectUrl}
          className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          Click or drag to jump around the track
        </span>
      </div>

      <div
        ref={pulseRef}
        className="relative h-[60vh] w-full cursor-pointer select-none overflow-hidden rounded-2xl border border-border bg-background/40 sm:h-[70vh]"
        style={{ transition: "transform 220ms ease-out" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromClientX(e.clientX);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {objectUrl && (
        <audio
          ref={audioRef}
          src={objectUrl}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}
