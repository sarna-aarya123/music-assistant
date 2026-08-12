import Link from "next/link";
import Mascot from "@/components/Mascot";

const links = [
  { href: "/coach", label: "AI Coach" },
  { href: "/midi-analyzer", label: "MIDI Analyzer" },
  { href: "/lyrics", label: "Lyric Lab" },
];

export default function NavBar() {
  return (
    <header className="hud-panel sticky top-4 z-10 mx-4 mt-4 max-w-5xl sm:mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Mascot size={38} />
          <span className="glitch-text font-display text-base uppercase tracking-wide sm:text-xl">
            AI Music Assistant
          </span>
        </Link>
        <nav className="flex flex-wrap justify-center gap-1 font-mono text-xs uppercase tracking-widest text-muted">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-2.5 py-1.5 transition hover:bg-accent2/15 hover:text-accent2 sm:px-3"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
