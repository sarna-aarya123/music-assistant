import Link from "next/link";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function NavBar() {
  return (
    <header className="hud-panel sticky top-4 z-10 mx-4 mt-4 max-w-5xl sm:mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="glitch-text font-display text-base uppercase tracking-wide sm:text-xl">
            AI Music Assistant
          </span>
        </Link>
        <ThemeSwitcher />
      </div>
    </header>
  );
}
