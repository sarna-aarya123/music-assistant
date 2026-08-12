"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  getCoachHistory,
  getFeedback,
  uploadTrack,
  type CoachFeedbackResponse,
  type CoachHistoryEntry,
} from "@/lib/api";
import { useCountUp } from "@/lib/useCountUp";

export default function CoachPage() {
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"upload" | "feedback" | null>(null);
  const [history, setHistory] = useState<CoachHistoryEntry[]>([]);

  useEffect(() => {
    getCoachHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  function friendlyError(err: unknown) {
    return err instanceof ApiError ? err.message : "Something went wrong.";
  }

  async function handleUploadAndAnalyze() {
    if (!file) return;
    setLoading("upload");
    setError(null);
    setFeedback(null);
    try {
      const uploaded = await uploadTrack(file);
      setLoading("feedback");
      setFeedback(await getFeedback(uploaded.track_id));
      getCoachHistory()
        .then(setHistory)
        .catch(() => {});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  function loadHistoryEntry(entry: CoachHistoryEntry) {
    setError(null);
    setFeedback(entry.feedback);
  }

  return (
    <div>
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">AI Coach</h1>
      <p className="mb-6 text-muted">Upload a song and get feedback.</p>

      <div className="hud-panel border border-border bg-surface p-6">
        <input
          type="file"
          accept=".wav,.mp3,.m4a,.flac,.aiff"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full font-mono text-sm text-muted"
        />
        <button
          onClick={handleUploadAndAnalyze}
          disabled={!file || loading !== null}
          className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
        >
          {loading === "upload" || loading === "feedback" ? "Analyzing..." : "Upload & Analyze"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{error}</p>
      )}

      {feedback && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="BPM" value={feedback.features.bpm} />
            <Stat label="Key" value={feedback.features.key} />
            <Stat label="Loudness" value={`${feedback.features.rms_db} dB`} />
            <Stat label="Brightness" value={`${Math.round(feedback.features.brightness_hz)} Hz`} />
            <Stat label="Rolloff" value={`${Math.round(feedback.features.rolloff_hz)} Hz`} />
            <Stat label="Zero-Crossing Rate" value={feedback.features.zero_crossing_rate} />
            <Stat label="Dynamic Range" value={`${feedback.features.dynamic_range_db} dB`} />
            <Stat label="Low-End Ratio" value={`${Math.round(feedback.features.low_end_ratio * 100)}%`} />
            <Stat label="Onset Density" value={`${feedback.features.onset_density}/s`} />
          </div>
          <div className="hud-panel border border-border bg-surface p-4">
            <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">
              Strengths
            </h3>
            <ul className="list-inside list-disc text-sm text-muted">
              {feedback.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="hud-panel border border-border bg-surface p-4">
            <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">
              Improvements
            </h3>
            <ul className="list-inside list-disc text-sm text-muted">
              {feedback.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-accent2">
            // Recent
          </h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.track_id}>
                <button
                  onClick={() => loadHistoryEntry(entry)}
                  disabled={loading !== null}
                  className="hud-panel w-full border border-border bg-surface p-3 text-left font-mono text-sm transition hover:border-accent2 disabled:opacity-40"
                >
                  <span className="font-medium text-ink">{entry.filename}</span>{" "}
                  <span className="text-muted">
                    — {entry.duration_sec}s · {new Date(entry.created_at).toLocaleString()}
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
