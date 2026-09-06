import type { Config } from "tailwindcss";

// Neon Arcade visual identity: dark starfield space with soft ambient glow, glassy toon-outlined
// panels (bold cel border + hard sticker shadow + neon bloom). Deliberately kept generic — no
// game-specific background iconography (shapes/rings/etc.), just color, glow, and motion.
// Palette: electric orange / teal / amber, on a dark violet-black background. Existing class names
// (hud-panel, glitch-text, etc.) are kept as stable hooks in globals.css so every page picks up the
// look without per-page edits.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0716",
        surface: "#160f2c",
        border: "#4b3b7d",
        ink: "#f3eeff",
        accent: "#ff5a36",
        accent2: "#2dd4bf",
        gold: "#ffb020",
        muted: "#a79bd9",
        success: "#2bd6a8",
        warning: "#ff9d3d",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      // Big, soft, glossy corners everywhere — every existing `rounded-*` picks this up.
      borderRadius: {
        none: "0",
        sm: "10px",
        DEFAULT: "16px",
        md: "18px",
        lg: "22px",
        xl: "28px",
        full: "9999px",
      },
      boxShadow: {
        glow: "0 0 32px 2px rgba(255, 90, 54, 0.5)",
        "glow-cyan": "0 0 32px 2px rgba(45, 212, 191, 0.5)",
        "glow-success": "0 0 26px 1px rgba(43, 214, 168, 0.55)",
        glass: "0 8px 32px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        // "Toon" sticker shadow: a hard, unblurred offset shadow instead of a soft blur — cartoon
        // cutout look, layered on top of the neon glow rather than replacing it.
        toon: "4px 4px 0 0 rgba(0,0,0,0.45)",
      },
      keyframes: {
        "scan-sweep": {
          "0%": { backgroundPosition: "-150% 0" },
          "100%": { backgroundPosition: "250% 0" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 var(--status-glow, rgba(43,214,168,0.6))" },
          "50%": { opacity: "0.6", boxShadow: "0 0 0 4px var(--status-glow, rgba(43,214,168,0))" },
        },
        "gradient-drift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0) rotate(var(--float-rot, 0deg))" },
          "50%": { transform: "translateY(-14px) rotate(var(--float-rot, 0deg))" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.25", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg) scale(1)" },
          "25%": { transform: "rotate(-10deg) scale(1.06)" },
          "75%": { transform: "rotate(10deg) scale(1.06)" },
        },
        "glow-pulse": {
          "0%, 100%": { filter: "brightness(1) saturate(1)" },
          "50%": { filter: "brightness(1.35) saturate(1.3)" },
        },
      },
      animation: {
        "scan-sweep": "scan-sweep 1.1s linear",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
        "gradient-drift": "gradient-drift 16s ease infinite",
        "float-slow": "float-y 7s ease-in-out infinite",
        "float-med": "float-y 5s ease-in-out infinite",
        "pop-in": "pop-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
        twinkle: "twinkle 2.6s ease-in-out infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        "spin-slower": "spin-slow 26s linear infinite",
        wiggle: "wiggle 0.6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
