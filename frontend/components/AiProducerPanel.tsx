"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  chatAboutSection,
  getAiStatus,
  getSectionInsight,
  type AiStatus,
  type ChatTurn,
} from "@/lib/api";

type Turn = ChatTurn & { unverified?: string[] };

/** Local-LLM read on one section. Every number the model is allowed to use is measured in Python
 * and sent as a fact sheet; the backend flags anything in the reply that isn't backed by it. Only
 * renders when Ollama is reachable (i.e. running locally) — the deployed site never shows it. */
export default function AiProducerPanel({
  trackId,
  segmentIndex,
}: {
  trackId: string;
  segmentIndex: number;
}) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAiStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // A different section is a different conversation.
  useEffect(() => {
    setTurns([]);
    setError(null);
  }, [trackId, segmentIndex]);

  if (!status?.available) return null;

  async function run(task: () => Promise<Turn>) {
    setBusy(true);
    setError(null);
    try {
      const turn = await task();
      setTurns((t) => [...t, turn]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function readSection() {
    run(async () => {
      const r = await getSectionInsight(trackId, segmentIndex);
      return { role: "assistant", content: r.text, unverified: r.unverified_claims };
    });
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    run(async () => {
      const r = await chatAboutSection(
        trackId,
        segmentIndex,
        next.map(({ role, content }) => ({ role, content }))
      );
      return { role: "assistant", content: r.reply, unverified: r.unverified_claims };
    });
  }

  return (
    <div className="mt-2 rounded-xl border border-accent2/40 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent2">
          AI Producer · {status.model} · local
        </span>
        {turns.length === 0 && (
          <button
            onClick={readSection}
            disabled={busy}
            className="bg-accent px-3 py-1 text-xs font-medium uppercase tracking-wide disabled:opacity-40"
          >
            {busy ? "Thinking..." : "Read this section"}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-sm ${
              t.role === "user" ? "ml-8 bg-accent/15 text-ink" : "mr-8 border-l-4 border-gold bg-surface text-ink"
            }`}
          >
            {t.content}
            {t.unverified && t.unverified.length > 0 && (
              <p className="mt-1 font-mono text-[10px] text-gold">
                Not backed by the measurements: {t.unverified.join(", ")}
              </p>
            )}
          </div>
        ))}
        {busy && turns.length > 0 && <p className="font-mono text-xs text-muted">Thinking...</p>}
      </div>

      {error && <p className="mt-2 text-xs text-accent">{error}</p>}

      {turns.length > 0 && (
        <div className="mt-2 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about this section..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent2"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="bg-accent px-3 py-1.5 text-xs font-medium uppercase tracking-wide disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      )}
    </div>
  );
}
