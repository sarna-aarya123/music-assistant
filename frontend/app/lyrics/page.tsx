"use client";

import { useState } from "react";
import { analyzeLyrics, ApiError, generateLyrics, type LyricsAnalyzeResponse } from "@/lib/api";

export default function LyricsPage() {
  const [lyrics, setLyrics] = useState("");
  const [styleReference, setStyleReference] = useState("");
  const [themePrompt, setThemePrompt] = useState("");

  const [analysis, setAnalysis] = useState<LyricsAnalyzeResponse | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"analyze" | "generate" | null>(null);

  function friendlyError(err: unknown) {
    if (!(err instanceof ApiError)) return "Something went wrong.";
    if (err.status === 503) return `${err.message} (Ollama isn't reachable — run \`ollama serve\`.)`;
    return err.message;
  }

  async function handleAnalyze() {
    if (!lyrics.trim()) return;
    setLoading("analyze");
    setError(null);
    setAnalysis(null);
    try {
      setAnalysis(await analyzeLyrics(lyrics, styleReference || undefined));
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
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Lyric Lab</h1>
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
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
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
          className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent disabled:opacity-40"
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
