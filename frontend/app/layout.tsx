import type { Metadata } from "next";
import { Courier_Prime } from "next/font/google";
import "./globals.css";

// A real typewriter face, used for everything — labels, screens and body alike.
const monoFont = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AI Music Assistant",
  description: "See what's happening inside your beat, second by second.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={monoFont.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
