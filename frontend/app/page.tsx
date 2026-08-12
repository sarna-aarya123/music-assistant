import FeatureCard from "@/components/FeatureCard";
import Mascot from "@/components/Mascot";

function WaveformIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12h2l2-7 3 14 3-10 2 6 2-3h6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" />
      <path d="M6 9l4 3-4 3" strokeLinecap="square" />
      <path d="M13 15h5" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div>
      <div className="hud-panel mb-10 flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
        <Mascot size={140} className="shrink-0" />
        <div>
          <div className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent2">
            ✦ system online — local-first ✦
          </div>
          <h1 className="glitch-text mb-2 font-display text-4xl uppercase tracking-wide">
            AI Music Assistant
          </h1>
          <p className="max-w-2xl text-muted">
            Feedback and analysis for producers working in the rage / plugg lane — upload a beat, a
            MIDI file, or your lyrics and get notes back in seconds. Deterministic analysis runs
            entirely on your machine in Python; Ollama AI feedback is optional, opt-in, on top.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          href="/coach"
          title="AI Coach"
          description="Upload a beat/melody/drum loop and get structured feedback, then ask follow-up questions."
          phase="Phase 3"
          icon={<WaveformIcon />}
        />
        <FeatureCard
          href="/midi-analyzer"
          title="MIDI Analyzer"
          description="Upload a .mid file and get key, BPM, feel, and mood."
          phase="Phase 1"
          icon={<GridIcon />}
        />
        <FeatureCard
          href="/lyrics"
          title="Lyric Lab"
          description="Paste lyrics for critique, or generate lines that match your flow."
          phase="Phase 2"
          icon={<TerminalIcon />}
        />
      </div>
    </div>
  );
}
