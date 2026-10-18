"use client";

import { useEffect, useState } from "react";

const BAR = 24;

/** Full-screen boot log: each stage of the analysis is a line that resolves to "ok" when it's done. */
export default function LoadingScreen({ stage, slow }: { stage: "upload" | "feedback"; slow: boolean }) {
  // A block bar that fills and wraps, so the screen always shows something moving.
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFilled((n) => (n + 1) % (BAR + 1)), 110);
    return () => clearInterval(id);
  }, []);

  // Nothing behind the loading screen should scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const bar = "█".repeat(filled) + "░".repeat(BAR - filled);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black p-6 text-white">
      <div className="w-full max-w-md border-2 border-white p-6" role="status">
        <p className="font-bold">AI MUSIC ASSISTANT</p>
        <div className="mt-5 space-y-1">
          <p>
            &gt; loading waveform {stage === "feedback" ? <span>... ok</span> : <span className="cursor" />}
          </p>
          <p className={stage === "feedback" ? "" : "text-white/30"}>
            &gt; creating studio {stage === "feedback" && <span className="cursor" />}
          </p>
        </div>
        <p className="mt-5 text-accent">{bar}</p>
        {slow && (
          <p className="mt-5 text-white/60">
            still working. the free server can take up to a minute to wake up if it has been idle.
          </p>
        )}
      </div>
    </div>
  );
}
