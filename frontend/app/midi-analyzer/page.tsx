"use client";

import { useState } from "react";
import { analyzeMidi, ApiError, type MidiAnalysisResponse } from "@/lib/api";

export default function MidiAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<MidiAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeMidi(file);
      setResult(data);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.status === 501 ? " (Phase 1 — not built yet, see PLAN.md)" : ""}`
          : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl uppercase tracking-wide">MIDI Analyzer</h1>
      <p className="mb-6 text-muted">
        Upload a .mid file to get key, BPM, note density, and a plain-English feel/mood read.
      </p>

      <div className="rounded-lg border border-border bg-surface p-6">
        <input
          type="file"
          accept=".mid,.midi"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full text-sm text-muted"
        />
        <button
          onClick={handleAnalyze}
          disabled={!file || loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          {error}
        </p>
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
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-1 font-medium">Feel</h3>
                <p className="text-sm text-muted">{result.feel_summary}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-1 font-medium">Notes</h3>
                <p className="text-sm text-muted">{result.notes}</p>
              </div>
              {result.suggestions.length > 0 && (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-1 font-medium">Suggestions</h3>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {result.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
              The stats above are computed locally — no AI needed. Want a plain-English feel/mood
              read and suggestions too? Install{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-accent underline">
                Ollama
              </a>
              , run <code className="rounded bg-background px-1">ollama serve</code>, pull a model
              (e.g. <code className="rounded bg-background px-1">ollama pull llama3:8b</code>), and
              re-run the analysis.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
