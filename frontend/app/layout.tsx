import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const displayFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});

const sansFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AI Music Assistant",
  description: "See what's happening inside your beat, second by second.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable}`}>
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-5xl items-baseline justify-between px-6 pt-8">
          <span className="font-display text-2xl">AI Music Assistant</span>
        </header>
        <main className="mx-auto max-w-5xl px-6 pb-20 pt-10 sm:pt-16">{children}</main>
      </body>
    </html>
  );
}
