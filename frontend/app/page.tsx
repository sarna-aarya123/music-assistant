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
import LoadingScreen from "@/components/LoadingScreen";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  // The exact File + duration behind the current `feedback`, kept separately from `file` (the
  // input's current selection) since the user can pick a new file before re-analyzing. Only set
  // for a fresh upload in this session — a history entry has no in-browser bytes to wave-form.
  const [analyzedFile, setAnalyzedFile] = useState<File | null>(null);
  // Duration of the currently-shown track — set on a fresh analysis (from the upload response) or
  // when loading a history entry (which carries its own duration_sec at the top level, separate
  // from `feedback.features`). Drives the time<->position math in the experience.
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
    setAnalyzedFile(null); // no in-browser bytes for a past entry, so no audio playback
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
      {loading && <LoadingScreen stage={loading} slow={slow} />}

      <div className="grid gap-12 md:grid-cols-[1.15fr_1fr] md:items-end">
        <div className="animate-fade-up">
          <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl">
            Hear what your beat is <em>doing</em>.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            Upload a track and see its whole shape. Pick any 30 seconds and step inside to see what is
            happening in it: how loud, how bright, how heavy the low end.
          </p>
        </div>

        <div className="animate-fade-up border border-ink/80 bg-surface p-6 [animation-delay:120ms]">
          <label className="block cursor-pointer">
            <span className="block text-sm text-muted">Your track</span>
            <span className="mt-1 block font-display text-3xl leading-tight">
              {file ? file.name : "Choose a file"}
            </span>
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.flac,.aiff"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <span className="mt-1 block text-sm text-muted">WAV, MP3, M4A, FLAC or AIFF, up to 50 MB</span>
          </label>
          <button
            onClick={handleUploadAndAnalyze}
            disabled={!file || loading !== null}
            className="mt-6 w-full bg-accent px-5 py-3 text-[15px] font-medium text-surface transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-accent"
          >
            Analyze this track
          </button>
        </div>
      </div>

      {error && <p className="mt-8 border-l-2 border-accent pl-4 text-accent">{error}</p>}

      {history.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-3xl">Recent</h2>
          <ul className="mt-4 border-t border-ink/20">
            {history.map((entry) => (
              <li key={entry.track_id} className="border-b border-ink/20">
                <button
                  onClick={() => loadHistoryEntry(entry)}
                  disabled={loading !== null}
                  className="flex w-full items-baseline justify-between gap-4 py-3 text-left transition hover:text-accent disabled:opacity-40"
                >
                  <span className="truncate font-display text-2xl">{entry.filename}</span>
                  <span className="num shrink-0 text-sm text-muted">
                    {Math.floor(entry.duration_sec / 60)}:{String(Math.round(entry.duration_sec % 60)).padStart(2, "0")}
                    {" · "}
                    {new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
