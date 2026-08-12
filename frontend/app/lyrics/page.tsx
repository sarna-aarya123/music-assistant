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
import UseAiToggle from "@/components/UseAiToggle";

export default function LyricsPage() {
  const [lyrics, setLyrics] = useState("");
  const [styleReference, setStyleReference] = useState("");
  const [themePrompt, setThemePrompt] = useState("");
  const [useAi, setUseAi] = useState(false);

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
    if (!lyrics.trim() || !useAi) return;
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
    if (!lyrics.trim() || !themePrompt.trim() || !useAi) return;
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
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">Lyric Lab</h1>
      <p className="mb-6 text-muted">
        Paste your lyrics, get critique, or generate a few candidate lines that match your flow.
        Critique/generation are inherently AI tasks — turn on Ollama below to use them.
      </p>

      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder="Paste your lyrics here, one line per bar..."
        rows={10}
        className="mb-3 w-full border border-border bg-surface p-3 font-mono text-sm"
      />

      <input
        value={styleReference}
        onChange={(e) => setStyleReference(e.target.value)}
        placeholder="Style reference (optional) — e.g. aggressive, short punchy bars"
        className="mb-3 w-full border border-border bg-surface p-3 text-sm"
      />

      <div className="mb-3">
        <UseAiToggle checked={useAi} onChange={setUseAi} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={!lyrics.trim() || !useAi || loading !== null}
          className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading === "analyze" ? "Analyzing..." : "Get Feedback"}
        </button>

        <input
          value={themePrompt}
          onChange={(e) => setThemePrompt(e.target.value)}
          placeholder="What should the new lines be about?"
          className="flex-1 border border-border bg-surface p-2 text-sm"
        />
        <button
          onClick={handleGenerate}
          disabled={!lyrics.trim() || !themePrompt.trim() || !useAi || loading !== null}
          className="border border-accent px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading === "generate" ? "Generating..." : "Generate Lines"}
        </button>
      </div>

      {!useAi && (
        <p className="mb-4 border border-dashed border-border p-3 font-mono text-sm text-muted">
          Turn on <span className="text-accent2">&quot;Use Ollama AI Coach&quot;</span> above to enable
          critique and line generation.
        </p>
      )}

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

      {candidates && (
        <div className="hud-panel border border-border bg-surface p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-accent2">
            Candidate lines
          </h3>
          <ul className="space-y-1 text-sm text-muted">
            {candidates.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
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
