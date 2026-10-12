import { useEffect, useState } from "react";

export type ThemeColors = { accent: string; accent2: string; gold: string; ink: string };

const FALLBACK: ThemeColors = { accent: "#ff5a36", accent2: "#2dd4bf", gold: "#ffb020", ink: "#f3eeff" };

/** Canvas fillStyle/strokeStyle and three.js materials need a literal resolved color, unlike
 * regular CSS which can read a `var(--x)` directly — so the current colorway's variables are read
 * here. Callers refresh whenever ThemeSwitcher fires the "themechange" event (see
 * components/ThemeSwitcher.tsx). */
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
  };
}

/** The active colorway as literal colors, kept current across theme switches. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);
  useEffect(() => {
    const refresh = () => setColors(readThemeColors());
    refresh();
    window.addEventListener("themechange", refresh);
    return () => window.removeEventListener("themechange", refresh);
  }, []);
  return colors;
}
