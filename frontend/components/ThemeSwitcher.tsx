"use client";

import { useEffect, useState } from "react";

export const THEMES = ["solar", "aurora", "toxic", "inferno"] as const;
export type ThemeName = (typeof THEMES)[number];

const THEME_LABELS: Record<ThemeName, string> = {
  solar: "Solar",
  aurora: "Aurora",
  toxic: "Toxic",
  inferno: "Inferno",
};

// Small preview swatches for the buttons below — kept in sync by hand with the actual variable
// values in globals.css (there's no way to read another theme's CSS variables without switching
// to it first, so this is the one place the colors are duplicated).
const THEME_PREVIEWS: Record<ThemeName, [string, string, string]> = {
  solar: ["#ff5a36", "#2dd4bf", "#ffb020"],
  aurora: ["#ff5cad", "#8b5cf6", "#33c7ff"],
  toxic: ["#ff2fd6", "#7cff3d", "#33baff"],
  inferno: ["#ff3b3b", "#ff8a00", "#ffd23f"],
};

const STORAGE_KEY = "theme";

/** Pill row of colorway swatches. Applying a theme is just setting `data-theme` on <html> — every
 * color in the app resolves through CSS variables keyed off that attribute (see globals.css), so
 * nothing else needs to know a switch happened, except canvas-drawn UI (WaveformExplorer), which
 * listens for the "themechange" event this dispatches to refresh its cached colors. */
export default function ThemeSwitcher() {
  const [active, setActive] = useState<ThemeName>("solar");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as ThemeName | null;
    if (current && THEMES.includes(current)) setActive(current);
  }, []);

  function applyTheme(theme: ThemeName) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme still applies for this page view, just won't persist.
    }
    window.dispatchEvent(new Event("themechange"));
    setActive(theme);
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Colorway">
      {THEMES.map((theme) => {
        const [a, b, c] = THEME_PREVIEWS[theme];
        return (
          <button
            key={theme}
            type="button"
            title={THEME_LABELS[theme]}
            aria-label={THEME_LABELS[theme]}
            aria-pressed={active === theme}
            onClick={() => applyTheme(theme)}
            className={`h-6 w-6 shrink-0 rounded-full transition ${
              active === theme ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-background" : "hover:scale-110"
            }`}
            style={{ background: `conic-gradient(${a}, ${b}, ${c}, ${a})` }}
          />
        );
      })}
    </div>
  );
}
