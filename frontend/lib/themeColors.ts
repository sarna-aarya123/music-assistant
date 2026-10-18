import { useEffect, useState } from "react";

export type ThemeColors = {
  accent: string;
  accent2: string;
  gold: string;
  ink: string;
  background: string;
  surface: string;
  muted: string;
};

const FALLBACK: ThemeColors = {
  accent: "rgb(205,52,40)",
  accent2: "rgb(52,47,40)",
  gold: "rgb(176,124,32)",
  ink: "rgb(22,20,15)",
  background: "rgb(240,235,224)",
  surface: "rgb(248,244,236)",
  muted: "rgb(110,103,90)",
};

/** three.js materials and canvas drawing need literal colors, not `var(--x)` — this reads the same
 * CSS variables the stylesheet uses (see app/globals.css) so 3D and UI never drift apart. */
export function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.documentElement);
  const rgb = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value ? `rgb(${value.replace(/\s+/g, ",")})` : fallback;
  };
  return {
    accent: rgb("--color-accent", FALLBACK.accent),
    accent2: rgb("--color-accent2", FALLBACK.accent2),
    gold: rgb("--color-gold", FALLBACK.gold),
    ink: rgb("--color-ink", FALLBACK.ink),
    background: rgb("--color-background", FALLBACK.background),
    surface: rgb("--color-surface", FALLBACK.surface),
    muted: rgb("--color-muted", FALLBACK.muted),
  };
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);
  useEffect(() => {
    setColors(readThemeColors());
  }, []);
  return colors;
}
