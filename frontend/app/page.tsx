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
import { useSlowLoadHint } from "@/lib/useSlowLoadHint";
import Experience from "@/components/Experience";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  // The exact File + duration behind the current `feedback`, kept separately from `file` (the
  // input's current selection) since the user can pick a new file before re-analyzing. Only set
  // for a fresh upload in this session — a history entry has no in-browser bytes to wave-form.
  const [analyzedFile, setAnalyzedFile] = useState<File | null>(null);
  // Duration of the currently-shown track — set on a fresh analysis (from the upload response) or
  // when loading a history entry (which carries its own duration_sec at the top level, separate
  // from `feedback.features`). Used by both WaveformExplorer (fresh analysis only) and SongMap
  // (either source) for time<->position math.
  const [durationSec, setDurationSec] = useState(0);
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
      setDurationSec(uploaded.duration_sec);
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
    setDurationSec(entry.duration_sec);
  }

  function reset() {
    setFeedback(null);
    setAnalyzedFile(null);
    setFile(null);
    setError(null);
  }

  // Once a track's been analyzed, the page becomes the full-screen experience (3D waveform -> studio);
  // its "New track" button is the way back to a fresh upload.
  if (feedback) {
    return (
      <Experience
        features={feedback.features}
        durationSec={durationSec}
        file={analyzedFile}
        onExit={reset}
      />
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
          {loading === "upload" ? "Loading waveform..." : loading === "feedback" ? "Creating studio..." : "Upload & Analyze"}
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
