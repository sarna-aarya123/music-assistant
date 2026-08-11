import type { Metadata } from "next";
import { Anton } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";

const displayFont = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "AI Music Assistant",
  description: "AI Coach, MIDI Analyzer, and Lyric Lab for producers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="min-h-screen bg-background text-white">
        <div aria-hidden className="app-texture" />
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
