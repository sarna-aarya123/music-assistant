import Link from "next/link";
import type { ReactNode } from "react";

type FeatureCardProps = {
  href: string;
  title: string;
  description: string;
  phase: string;
  icon: ReactNode;
};

export default function FeatureCard({ href, title, description, phase, icon }: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="hud-scan-surface hud-panel group block border border-border bg-surface p-6 transition hover:border-accent2 hover:shadow-glow-cyan hover:animate-scan-sweep"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-accent2 transition group-hover:text-accent">{icon}</span>
        <span className="border border-accent/50 px-2 py-0.5 font-mono text-[10px] uppercase text-accent">
          {phase}
        </span>
      </div>
      <h2 className="mb-2 font-display text-lg uppercase tracking-wide">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
    </Link>
  );
}
