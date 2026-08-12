"use client";

import { useEffect, useState } from "react";
import { getOllamaInstalled } from "@/lib/api";

type UseAiToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
};

export default function UseAiToggle({ checked, onChange }: UseAiToggleProps) {
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    getOllamaInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(false));
  }, []);

  const disabled = installed !== true;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={
        installed === null
          ? "Checking for Ollama…"
          : installed
            ? "Toggle AI-generated feedback on/off for the next run"
            : "Ollama wasn't found on this machine — install it from ollama.com to enable AI feedback"
      }
      className={`hud-panel flex items-center gap-2 border px-3 py-2 text-xs uppercase tracking-widest transition ${
        disabled
          ? "cursor-not-allowed border-border bg-surface text-muted opacity-50"
          : checked
            ? "border-success bg-success/10 text-success shadow-glow-success"
            : "border-border bg-surface text-muted hover:border-accent2 hover:text-accent2"
      }`}
    >
      <span
        className={`status-dot ${
          disabled ? "bg-muted" : checked ? "animate-status-pulse bg-success" : "bg-accent2/70"
        }`}
        style={checked ? ({ "--status-glow": "rgba(57,255,143,0.6)" } as React.CSSProperties) : undefined}
      />
      Use Ollama AI Coach {disabled ? "(not installed)" : checked ? "(on)" : "(if installed)"}
    </button>
  );
}
