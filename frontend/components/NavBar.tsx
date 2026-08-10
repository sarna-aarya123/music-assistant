import Link from "next/link";

const links = [
  { href: "/coach", label: "AI Coach" },
  { href: "/midi-analyzer", label: "MIDI Analyzer" },
  { href: "/lyrics", label: "Lyric Lab" },
];

export default function NavBar() {
  return (
    <header className="border-b border-border bg-surface/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          AI Music Assistant
        </Link>
        <nav className="flex gap-6 text-sm text-muted">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
