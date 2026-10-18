"use client";

import { useEffect } from "react";

const BARS = 56;
// Fixed, deterministic bar heights: a waveform-ish silhouette that's identical on every render.
const HEIGHTS = Array.from({ length: BARS }, (_, i) => 0.22 + 0.78 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.53)));

/** Full-screen loading state: ink bars rise and fall like a waveform being drawn, with a caption
 * for whichever stage the analysis is on. */
export default function LoadingScreen({ stage, slow }: { stage: "upload" | "feedback"; slow: boolean }) {
  const caption = stage === "upload" ? "Loading waveform" : "Creating studio";
  // Nothing behind the loading screen should scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background px-6">
      <div className="flex h-40 items-center gap-[5px]" aria-hidden>
        {HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="block w-[3px] origin-center animate-ink-rise bg-ink"
            style={{ height: `${h * 100}%`, animationDelay: `${(i % 14) * 80 + Math.floor(i / 14) * 40}ms` }}
          />
        ))}
      </div>
      <p key={caption} role="status" className="mt-10 animate-caption-in font-display text-4xl italic sm:text-5xl">
        {caption}…
      </p>
      <p className="num mt-2 text-sm text-muted">Step {stage === "upload" ? 1 : 2} of 2</p>
      {slow && (
        <p className="mt-8 max-w-sm text-center text-sm text-muted">
          Still working. The free server can take up to a minute to wake up if it has been idle.
        </p>
      )}
    </div>
  );
}
