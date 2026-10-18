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
    <div className="flex min-h-screen items-center justify-center p-6">
      {loading && <LoadingScreen stage={loading} slow={slow} />}

      <div className="w-full max-w-md space-y-5">
        <div className="border-2 border-white p-6">
          <h1 className="font-bold">AI MUSIC ASSISTANT</h1>
          <p className="mt-4">Upload a beat. See the shape of the whole track, then step into any 30 seconds of it.</p>

          <div className="mt-6">
            <label className="inline-block cursor-pointer border border-white px-4 py-2 transition hover:bg-white hover:text-black">
              [ choose file ]
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.flac,.aiff"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
            <p className="mt-3 break-all text-white/60">{file ? file.name : "wav, mp3, m4a, flac or aiff. up to 50 MB."}</p>
          </div>

          <button
            onClick={handleUploadAndAnalyze}
            disabled={!file || loading !== null}
            className="mt-6 w-full bg-accent px-4 py-2.5 font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-accent"
          >
            analyze
          </button>
        </div>

        {error && <p className="border border-accent p-3 text-accent">{error}</p>}

        {history.length > 0 && (
          <div className="border border-white/60 p-4">
            <p className="text-white/60">recent</p>
            <ul className="mt-2">
              {history.map((entry) => (
                <li key={entry.track_id}>
                  <button
                    onClick={() => loadHistoryEntry(entry)}
                    disabled={loading !== null}
                    className="flex w-full items-baseline justify-between gap-3 py-1 text-left transition hover:text-accent disabled:opacity-40"
                  >
                    <span className="truncate">&gt; {entry.filename}</span>
                    <span className="shrink-0 text-white/50">
                      {Math.floor(entry.duration_sec / 60)}:{String(Math.round(entry.duration_sec % 60)).padStart(2, "0")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
