import FeatureCard from "@/components/FeatureCard";

export default function HomePage() {
  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">AI Music Assistant</h1>
      <p className="mb-10 max-w-2xl text-muted">
        Feedback and analysis for producers working in the rage / plugg lane — upload a beat, a
        MIDI file, or your lyrics and get notes back in seconds. Runs entirely on your machine via
        Ollama.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          href="/coach"
          title="AI Coach"
          description="Upload a beat/melody/drum loop and get structured feedback, then ask follow-up questions."
          phase="Phase 3"
        />
        <FeatureCard
          href="/midi-analyzer"
          title="MIDI Analyzer"
          description="Upload a .mid file and get key, BPM, feel, and mood."
          phase="Phase 1"
        />
        <FeatureCard
          href="/lyrics"
          title="Lyric Lab"
          description="Paste lyrics for critique, or generate lines that match your flow."
          phase="Phase 2"
        />
      </div>
    </div>
  );
}
