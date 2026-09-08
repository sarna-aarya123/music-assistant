import type { Metadata } from "next";
import { Anton, JetBrains_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
import GlowField from "@/components/GlowField";
import "./globals.css";

const displayFont = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AI Music Assistant",
  description: "Simple feedback for your beats, MIDI, and lyrics.",
};

// Runs before paint, straight in <head>, so a returning visitor's saved colorway applies
// immediately instead of flashing the default theme for a frame — the standard no-FOUC pattern.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${monoFont.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-ink">
        <div aria-hidden className="hud-grid" />
        <div aria-hidden className="app-texture" />
        <GlowField />
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
