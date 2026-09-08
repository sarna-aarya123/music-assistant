type Orb = {
  top: string;
  left: string;
  size: number;
  color: string;
  anim: string;
  delay: string;
  blur: number;
  opacity: number;
};

// Deliberately generic: soft blurred color orbs drifting slowly, no distinct geometry/iconography
// (no shapes, rings, or anything that could read as a specific game/level motif) — just color,
// glow, and slow motion behind the panels. Colors are CSS var() references (not literal hex) —
// the browser re-resolves them itself whenever the active colorway's `[data-theme]` variables
// change (see globals.css), so this needs zero JS to stay in sync with the theme switcher.
const ORBS: Orb[] = [
  { top: "5%", left: "10%", size: 320, color: "rgb(var(--color-accent))", anim: "animate-float-slow", delay: "0s", blur: 90, opacity: 0.22 },
  { top: "55%", left: "82%", size: 280, color: "rgb(var(--color-accent2))", anim: "animate-float-med", delay: "1s", blur: 90, opacity: 0.2 },
  { top: "80%", left: "20%", size: 220, color: "rgb(var(--color-gold))", anim: "animate-float-slow", delay: "2s", blur: 80, opacity: 0.16 },
  { top: "20%", left: "60%", size: 180, color: "rgb(var(--color-accent))", anim: "animate-float-med", delay: "0.6s", blur: 70, opacity: 0.14 },
  { top: "-6%", left: "45%", size: 260, color: "rgb(var(--color-accent2))", anim: "animate-float-slow", delay: "1.6s", blur: 100, opacity: 0.14 },
];

/** Fixed, decorative ambient glow orbs drifting behind the page content. Purely visual. */
export default function GlowField() {
  return (
    <div aria-hidden className="fixed inset-0 z-0 overflow-hidden">
      {ORBS.map((o, i) => (
        <div
          key={i}
          className={`crystal-shard rounded-full ${o.anim}`}
          style={{
            top: o.top,
            left: o.left,
            width: o.size,
            height: o.size,
            opacity: o.opacity,
            animationDelay: o.delay,
            background: o.color,
            filter: `blur(${o.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}
