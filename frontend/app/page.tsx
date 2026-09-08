"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  getCoachHistory,
  getFeedback,
  uploadTrack,
  type CoachFeedbackResponse,
  type CoachHistoryEntry,
} from "@/lib/api";
import { useCountUp } from "@/lib/useCountUp";
import { useSlowLoadHint } from "@/lib/useSlowLoadHint";
import WaveformExplorer from "@/components/WaveformExplorer";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  // The exact File + duration behind the current `feedback`, kept separately from `file` (the
  // input's current selection) since the user can pick a new file before re-analyzing. Only set
  // for a fresh upload in this session — a history entry has no in-browser bytes to wave-form.
  const [analyzedFile, setAnalyzedFile] = useState<File | null>(null);
  const [analyzedDuration, setAnalyzedDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"upload" | "feedback" | null>(null);
  const [history, setHistory] = useState<CoachHistoryEntry[]>([]);
  const slow = useSlowLoadHint(loading !== null);

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
    setAnalyzedFile(null);
    try {
      const uploaded = await uploadTrack(file);
      setLoading("feedback");
      setFeedback(await getFeedback(uploaded.track_id));
      setAnalyzedFile(file);
      setAnalyzedDuration(uploaded.duration_sec);
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
    setAnalyzedFile(null); // no in-browser bytes for a past entry — waveform explorer needs those
  }

  function reset() {
    setFeedback(null);
    setAnalyzedFile(null);
    setFile(null);
    setError(null);
  }

  // Once a track's been analyzed, the upload form gets out of the way entirely and the waveform
  // takes over the page — this bar is the only way back to a fresh upload (there's no separate
  // "home" to go back to anymore — this page is the whole app).
  if (feedback) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-end">
          <button
            onClick={reset}
            className="font-mono text-xs uppercase tracking-widest text-muted transition hover:text-accent2"
          >
            Analyze another track
          </button>
        </div>

        {analyzedFile ? (
          <WaveformExplorer
            file={analyzedFile}
            durationSec={analyzedDuration}
            onsetTimes={feedback.features.onset_times}
            beatTimes={feedback.features.beat_times}
          />
        ) : (
          <div className="hud-panel flex h-[60vh] items-center justify-center border border-border bg-surface p-4 text-center font-mono text-xs text-muted sm:h-[70vh]">
            No waveform for past entries — analyze a track to see it here.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="hud-panel border border-border bg-surface p-4">
            <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-accent2">Stats</h3>
            <dl className="space-y-1">
              <StatRow label="BPM" value={feedback.features.bpm} />
              <StatRow label="Key" value={feedback.features.key} />
              <StatRow label="Loudness" value={`${feedback.features.rms_db} dB`} />
              <StatRow label="Brightness" value={`${Math.round(feedback.features.brightness_hz)} Hz`} />
              <StatRow label="Rolloff" value={`${Math.round(feedback.features.rolloff_hz)} Hz`} />
              <StatRow label="Zero-Crossing Rate" value={feedback.features.zero_crossing_rate} />
              <StatRow label="Dynamic Range" value={`${feedback.features.dynamic_range_db} dB`} />
              <StatRow label="Low-End Ratio" value={`${Math.round(feedback.features.low_end_ratio * 100)}%`} />
              <StatRow label="Onset Density" value={`${feedback.features.onset_density}/s`} />
            </dl>
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
      </div>
    );
  }

  return (
    <div>
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">AI Music Assistant</h1>
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
        {slow && (
          <p className="mt-3 font-mono text-xs text-muted">
            Still working — the free-tier server can take up to a minute to wake up if it's been idle.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{error}</p>
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

function StatRow({ label, value }: { label: string; value: string | number }) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? Math.round(animated * 100) / 100 : value;
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1.5 font-mono text-xs last:border-0">
      <span className="uppercase tracking-widest text-muted">{label}</span>
      <span className="font-semibold text-accent2">{display}</span>
    </div>
  );
}
