import Link from "next/link";

const links = [
  { href: "/coach", label: "AI Coach" },
  { href: "/midi-analyzer", label: "MIDI Analyzer" },
  { href: "/lyrics", label: "Lyric Lab" },
];

export default function NavBar() {
  return (
    <header className="hud-panel border-b border-accent2/40 bg-surface/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="glitch-text font-display text-xl uppercase tracking-wide text-white">
          <span className="mr-2 text-accent2">//</span>
          AI Music Assistant
        </Link>
        <nav className="flex gap-6 font-mono text-xs uppercase tracking-widest text-muted">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-accent2">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
