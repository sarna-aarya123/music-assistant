"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  getCoachChatHistory,
  getCoachHistory,
  getFeedback,
  sendChatMessage,
  uploadTrack,
  type ChatMessage,
  type CoachFeedbackResponse,
  type CoachHistoryEntry,
} from "@/lib/api";
import { useCountUp } from "@/lib/useCountUp";
import UseAiToggle from "@/components/UseAiToggle";

export default function CoachPage() {
  const [file, setFile] = useState<File | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"upload" | "feedback" | "chat" | "history" | null>(null);
  const [history, setHistory] = useState<CoachHistoryEntry[]>([]);

  useEffect(() => {
    getCoachHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  function friendlyError(err: unknown) {
    if (!(err instanceof ApiError)) return "Something went wrong.";
    if (err.status === 503) return `${err.message} (Ollama isn't reachable — run \`ollama serve\`.)`;
    return err.message;
  }

  async function handleUploadAndAnalyze() {
    if (!file) return;
    setLoading("upload");
    setError(null);
    setFeedback(null);
    setMessages([]);
    try {
      const uploaded = await uploadTrack(file);
      setTrackId(uploaded.track_id);
      setLoading("feedback");
      setFeedback(await getFeedback(uploaded.track_id, useAi));
      getCoachHistory()
        .then(setHistory)
        .catch(() => {});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  async function loadHistoryEntry(entry: CoachHistoryEntry) {
    setError(null);
    setTrackId(entry.track_id);
    setFeedback(entry.feedback);
    setLoading("history");
    try {
      setMessages(await getCoachChatHistory(entry.track_id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleSendMessage() {
    if (!trackId || !chatInput.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: chatInput }];
    setMessages(nextMessages);
    setChatInput("");
    setLoading("chat");
    setError(null);
    try {
      const { reply } = await sendChatMessage(trackId, nextMessages);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <h1 className="glitch-text mb-2 font-display text-3xl uppercase tracking-wide">AI Coach</h1>
      <p className="mb-6 text-muted">
        Upload a beat/melody/drum loop for deterministic Python-side features, plus optional
        AI-generated feedback and follow-up chat.
      </p>

      <div className="hud-panel border border-border bg-surface p-6">
        <input
          type="file"
          accept=".wav,.mp3,.m4a,.flac,.aiff"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full font-mono text-sm text-muted"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleUploadAndAnalyze}
            disabled={!file || loading !== null}
            className="bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wide transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
          >
            {loading === "upload" || loading === "feedback" ? "Analyzing..." : "Upload & Analyze"}
          </button>
          <UseAiToggle checked={useAi} onChange={setUseAi} />
        </div>
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
          </div>
          {feedback.ai_available ? (
            <>
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
              {feedback.follow_up_questions.length > 0 && (
                <div className="hud-panel border border-border bg-surface p-4">
                  <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-accent2">
                    The coach might ask
                  </h3>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {feedback.follow_up_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="border border-dashed border-border p-4 font-mono text-sm text-muted">
              The stats above are computed locally in Python — no AI needed. Toggle{" "}
              <span className="text-accent2">&quot;Use Ollama AI Coach&quot;</span> above and re-run
              upload &amp; analyze for strengths/improvements feedback and chat too.
            </div>
          )}
        </div>
      )}

      {trackId && feedback && feedback.ai_available && (
        <div className="hud-panel mt-6 border border-border bg-surface p-4">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-accent2">
            Ask a follow-up
          </h3>
          <div className="mb-3 space-y-2">
            {messages.map((m, i) => (
              <p key={i} className="text-sm">
                <span className="text-muted">{m.role === "user" ? "You: " : "Coach: "}</span>
                {m.content}
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="e.g. why does the low end sound muddy?"
              className="flex-1 border border-border bg-background p-2 text-sm"
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || loading !== null}
              className="border border-accent px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent transition hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none"
            >
              Send
            </button>
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
