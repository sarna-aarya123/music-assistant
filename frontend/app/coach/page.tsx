"use client";

import { useState } from "react";
import {
  ApiError,
  getFeedback,
  sendChatMessage,
  uploadTrack,
  type ChatMessage,
  type CoachFeedbackResponse,
} from "@/lib/api";

export default function CoachPage() {
  const [file, setFile] = useState<File | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedbackResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"upload" | "feedback" | "chat" | null>(null);

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
      setFeedback(await getFeedback(uploaded.track_id));
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
      <h1 className="mb-2 text-2xl font-bold">AI Coach</h1>
      <p className="mb-6 text-muted">
        Upload a beat/melody/drum loop for structured feedback, then ask follow-up questions.
      </p>

      <div className="rounded-lg border border-border bg-surface p-6">
        <input
          type="file"
          accept=".wav,.mp3,.m4a,.flac,.aiff"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full text-sm text-muted"
        />
        <button
          onClick={handleUploadAndAnalyze}
          disabled={!file || loading !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {loading === "upload" || loading === "feedback" ? "Analyzing..." : "Upload & Analyze"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          {error}
        </p>
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
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-1 font-medium">Strengths</h3>
                <ul className="list-inside list-disc text-sm text-muted">
                  {feedback.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-1 font-medium">Improvements</h3>
                <ul className="list-inside list-disc text-sm text-muted">
                  {feedback.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              {feedback.follow_up_questions.length > 0 && (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-1 font-medium">The coach might ask</h3>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {feedback.follow_up_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
              The stats above are computed locally — no AI needed. Want strengths/improvements
              feedback and chat too? Install{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-accent underline">
                Ollama
              </a>
              , run <code className="rounded bg-background px-1">ollama serve</code>, pull a model
              (e.g. <code className="rounded bg-background px-1">ollama pull llama3:8b</code>), and
              re-run the analysis.
            </div>
          )}
        </div>
      )}

      {trackId && feedback && feedback.ai_available && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">Ask a follow-up</h3>
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
              className="flex-1 rounded-lg border border-border bg-background p-2 text-sm"
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || loading !== null}
              className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
