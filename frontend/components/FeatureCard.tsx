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
      className="hud-scan-surface hud-panel group block p-6 transition hover:animate-scan-sweep"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent2/25 to-accent/25 text-accent2 shadow-inner transition group-hover:from-accent/30 group-hover:to-gold/30 group-hover:text-accent">
          {icon}
        </span>
        <span className="rounded-full bg-gold/20 px-2.5 py-1 font-mono text-[10px] uppercase text-warning">
          {phase}
        </span>
      </div>
      <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-ink">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
    </Link>
  );
}
