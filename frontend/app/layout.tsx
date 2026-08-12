import type { Metadata } from "next";
import { Anton, JetBrains_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
import CrystalField from "@/components/CrystalField";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${monoFont.variable}`}>
      <body className="min-h-screen bg-background text-ink">
        <div aria-hidden className="hud-grid" />
        <div aria-hidden className="app-texture" />
        <CrystalField />
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
