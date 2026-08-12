import type { Config } from "tailwindcss";

// Cyberpunk/HUD visual identity: dark, angular producer-tool look with neon status colors and a
// terminal/mono readout font layered on top of the existing rage/plugg accent palette.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#141414",
        border: "#262626",
        accent: "#ff2d55",
        accent2: "#22e0ff",
        muted: "#8a8a8a",
        success: "#39ff8f",
        warning: "#ffb800",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      // Sharp/angular by default instead of Tailwind's soft default radii — every existing
      // `rounded-lg`/`rounded-md` in the app picks this up automatically.
      borderRadius: {
        none: "0",
        sm: "1px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "3px",
        full: "9999px",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(255, 45, 85, 0.45)",
        "glow-cyan": "0 0 24px -4px rgba(34, 224, 255, 0.45)",
        "glow-success": "0 0 18px -4px rgba(57, 255, 143, 0.5)",
      },
      keyframes: {
        "scan-sweep": {
          "0%": { backgroundPosition: "-150% 0" },
          "100%": { backgroundPosition: "250% 0" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 var(--status-glow, rgba(57,255,143,0.6))" },
          "50%": { opacity: "0.6", boxShadow: "0 0 0 4px var(--status-glow, rgba(57,255,143,0))" },
        },
      },
      animation: {
        "scan-sweep": "scan-sweep 1.1s linear",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
