"use client";

import { useEffect, useState } from "react";
import {
  analyzeLyrics,
  ApiError,
  generateLyrics,
  getLyricsHistory,
  type LyricsAnalyzeResponse,
  type LyricsHistoryEntry,
} from "@/lib/api";

export default function LyricsPage() {
  const [lyrics, setLyrics] = useState("");
  const [styleReference, setStyleReference] = useState("");
  const [themePrompt, setThemePrompt] = useState("");

  const [analysis, setAnalysis] = useState<LyricsAnalyzeResponse | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"analyze" | "generate" | null>(null);
  const [history, setHistory] = useState<LyricsHistoryEntry[]>([]);

  useEffect(() => {
    getLyricsHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  function friendlyError(err: unknown) {
    if (!(err instanceof ApiError)) return "Something went wrong.";
    if (err.status === 503) return `${err.message} (Ollama isn't reachable — run \`ollama serve\`.)`;
    return err.message;
  }

  function refreshHistory() {
    getLyricsHistory()
      .then(setHistory)
      .catch(() => {});
  }

  async function handleAnalyze() {
    if (!lyrics.trim()) return;
    setLoading("analyze");
    setError(null);
    setAnalysis(null);
    try {
      setAnalysis(await analyzeLyrics(lyrics, styleReference || undefined));
      refreshHistory();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerate() {
    if (!lyrics.trim() || !themePrompt.trim()) return;
    setLoading("generate");
    setError(null);
    setCandidates(null);
    try {
      const data = await generateLyrics(lyrics, themePrompt, styleReference || undefined);
      setCandidates(data.candidates);
      refreshHistory();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  function loadHistoryEntry(entry: LyricsHistoryEntry) {
    setLyrics(entry.lyrics);
    setStyleReference(entry.style_reference ?? "");
    if (entry.mode === "analyze") {
      setAnalysis(entry.result as LyricsAnalyzeResponse);
      setCandidates(null);
    } else {
      setThemePrompt(entry.theme_or_prompt ?? "");
      setCandidates((entry.result as { candidates: string[] }).candidates);
      setAnalysis(null);
    }
  }

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl uppercase tracking-wide">Lyric Lab</h1>
      <p className="mb-6 text-muted">
        Paste your lyrics, get critique, or generate a few candidate lines that match your flow.
      </p>

      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder="Paste your lyrics here, one line per bar..."
        rows={10}
        className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm"
      />

      <input
        value={styleReference}
        onChange={(e) => setStyleReference(e.target.value)}
        placeholder="Style reference (optional) — e.g. aggressive, short punchy bars"
        className="mb-3 w-full rounded-lg border border-border bg-surface p-3 text-sm"
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={!lyrics.trim() || loading !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading === "analyze" ? "Analyzing..." : "Get Feedback"}
        </button>

        <input
          value={themePrompt}
          onChange={(e) => setThemePrompt(e.target.value)}
          placeholder="What should the new lines be about?"
          className="flex-1 rounded-lg border border-border bg-surface p-2 text-sm"
        />
        <button
          onClick={handleGenerate}
          disabled={!lyrics.trim() || !themePrompt.trim() || loading !== null}
          className="rounded-md border border-accent px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading === "generate" ? "Generating..." : "Generate Lines"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          {error}
        </p>
      )}

      {analysis && (
        <div className="mb-6 space-y-3">
          <Section title="Overall" text={analysis.overall_notes} />
          <Section title="Rhyme" text={analysis.rhyme_notes} />
          <Section title="Repetition" text={analysis.repetition_notes} />
          <Section title="Cadence" text={analysis.cadence_notes} />
          {analysis.line_by_line.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-2 font-medium">Line by line</h3>
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

      {candidates && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 font-medium">Candidate lines</h3>
          <ul className="space-y-1 text-sm text-muted">
            {candidates.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-display text-lg uppercase tracking-wide text-muted">Recent</h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => loadHistoryEntry(entry)}
                  className="w-full rounded-lg border border-border bg-surface p-3 text-left text-sm transition hover:border-accent"
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-1 font-medium">{title}</h3>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
