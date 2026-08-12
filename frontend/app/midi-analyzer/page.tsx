"use client";

import { useEffect, useState } from "react";
import {
  analyzeMidi,
  ApiError,
  getMidiHistory,
  type MidiAnalysisResponse,
  type MidiHistoryEntry,
} from "@/lib/api";
import { useCountUp } from "@/lib/useCountUp";
import UseAiToggle from "@/components/UseAiToggle";

export default function MidiAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [result, setResult] = useState<MidiAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<MidiHistoryEntry[]>([]);

  useEffect(() => {
    getMidiHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  function friendlyError(err: unknown) {
    return err instanceof ApiError ? err.message : "Something went wrong.";
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeMidi(file, useAi);
      setResult(data);
      getMidiHistory()
        .then(setHistory)
        .catch(() => {});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">MIDI Analyzer</h1>
      <p className="mb-6 text-muted">
        Upload a .mid file to get key, BPM, note density — computed locally in Python — plus an
        optional AI feel/mood read.
      </p>

      <div className="hud-panel border border-border bg-surface p-6">
        <input
          type="file"
          accept=".mid,.midi"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full font-mono text-sm text-muted"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
          <UseAiToggle checked={useAi} onChange={setUseAi} />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{error}</p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="BPM" value={result.bpm} />
            <Stat label="Key" value={result.key} />
            <Stat label="Time Sig" value={result.time_signature} />
            <Stat label="Note Density" value={result.note_density} />
            <Stat label="Avg Velocity" value={result.avg_velocity} />
            <Stat label="Tracks" value={result.track_count} />
          </div>
          {result.ai_available ? (
            <>
              <div className="hud-panel border border-border bg-surface p-4">
                <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">Feel</h3>
                <p className="text-sm text-muted">{result.feel_summary}</p>
              </div>
              <div className="hud-panel border border-border bg-surface p-4">
                <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">Notes</h3>
                <p className="text-sm text-muted">{result.notes}</p>
              </div>
              {result.suggestions.length > 0 && (
                <div className="hud-panel border border-border bg-surface p-4">
                  <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">
                    Suggestions
                  </h3>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {result.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="border border-dashed border-border p-4 font-mono text-sm text-muted">
              The stats above are computed locally in Python — no AI needed. Toggle{" "}
              <span className="text-accent2">&quot;Use Ollama AI Coach&quot;</span> above and re-run the
              analysis for a plain-English feel/mood read and suggestions too.
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-accent2">
            // Recent
          </h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => setResult(entry)}
                  className="hud-panel w-full border border-border bg-surface p-3 text-left font-mono text-sm transition hover:border-accent2"
                >
                  <span className="font-medium text-ink">{entry.filename}</span>{" "}
                  <span className="text-muted">
                    — {entry.key}, {entry.bpm} BPM · {new Date(entry.created_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? Math.round(animated * 100) / 100 : value;
  return (
    <div className="hud-panel border border-border bg-surface p-3">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="font-mono text-lg font-semibold text-accent2">{display}</div>
    </div>
  );
}
