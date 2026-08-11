import Link from "next/link";

type FeatureCardProps = {
  href: string;
  title: string;
  description: string;
  phase: string;
};

export default function FeatureCard({ href, title, description, phase }: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-surface p-6 transition hover:border-accent hover:shadow-glow"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg uppercase tracking-wide">{title}</h2>
        <span className="rounded-full border border-accent/50 px-2 py-0.5 text-xs uppercase text-accent">
          {phase}
        </span>
      </div>
      <p className="text-sm text-muted">{description}</p>
    </Link>
  );
}
