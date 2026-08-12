"use client";

import { useEffect, useState } from "react";
import {
  analyzeLyrics,
  ApiError,
  getLyricsHistory,
  type LyricsAnalyzeResponse,
  type LyricsHistoryEntry,
} from "@/lib/api";

export default function LyricsPage() {
  const [lyrics, setLyrics] = useState("");

  const [analysis, setAnalysis] = useState<LyricsAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<LyricsHistoryEntry[]>([]);

  useEffect(() => {
    getLyricsHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  function friendlyError(err: unknown) {
    return err instanceof ApiError ? err.message : "Something went wrong.";
  }

  async function handleAnalyze() {
    if (!lyrics.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      setAnalysis(await analyzeLyrics(lyrics));
      getLyricsHistory()
        .then(setHistory)
        .catch(() => {});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  function loadHistoryEntry(entry: LyricsHistoryEntry) {
    setLyrics(entry.lyrics);
    if (entry.mode === "analyze") {
      setAnalysis(entry.result as LyricsAnalyzeResponse);
    }
  }

  return (
    <div>
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">Lyric Lab</h1>
      <p className="mb-6 text-muted">Paste your lyrics and get feedback.</p>

      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder="Paste your lyrics here, one line per bar..."
        rows={10}
        className="mb-3 w-full border border-border bg-surface p-3 font-mono text-sm"
      />

      <div className="mb-6">
        <button
          onClick={handleAnalyze}
          disabled={!lyrics.trim() || loading}
          className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading ? "Analyzing..." : "Get Feedback"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{error}</p>
      )}

      {analysis && (
        <div className="mb-6 space-y-3">
          <Section title="Overall" text={analysis.overall_notes} />
          <Section title="Rhyme" text={analysis.rhyme_notes} />
          <Section title="Repetition" text={analysis.repetition_notes} />
          <Section title="Cadence" text={analysis.cadence_notes} />
          {analysis.line_by_line.length > 0 && (
            <div className="hud-panel border border-border bg-surface p-4">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-accent2">
                Line by line
              </h3>
              <ul className="space-y-2 text-sm">
                {analysis.line_by_line.map((item, i) => (
                  <li key={i}>
                    <p>{item.line}</p>
                    <p className="text-muted">{item.note}</p>
                  </li>
                ))}
              </ul>
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
                  onClick={() => loadHistoryEntry(entry)}
                  className="hud-panel w-full border border-border bg-surface p-3 text-left font-mono text-sm transition hover:border-accent2"
                >
                  <span className="font-medium uppercase text-accent">{entry.mode}</span>{" "}
                  <span className="text-muted">
                    — {entry.lyrics.split("\n")[0].slice(0, 60)} ·{" "}
                    {new Date(entry.created_at).toLocaleString()}
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

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="hud-panel border border-border bg-surface p-4">
      <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">{title}</h3>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
