import type { Config } from "tailwindcss";

// Crystal Arcade visual identity: bright, glossy, JRPG-menu-inspired look — pastel gradient sky,
// glass/crystal panels, rounded pill controls, candy-colored accents. Replaces the earlier dark
// cyberpunk/HUD theme; existing class names (hud-panel, glitch-text, etc.) are kept as stable
// hooks in globals.css so every page picks up the new look without per-component edits.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f5f1ff",
        surface: "#ffffff",
        border: "#d9c9ff",
        ink: "#241b4d",
        accent: "#ff5cad",
        accent2: "#33c7ff",
        gold: "#ffcf40",
        muted: "#6a628f",
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
        glow: "0 10px 30px -6px rgba(255, 92, 173, 0.45)",
        "glow-cyan": "0 10px 30px -6px rgba(51, 199, 255, 0.45)",
        "glow-success": "0 10px 26px -6px rgba(43, 214, 168, 0.5)",
        glass: "0 8px 32px -8px rgba(120, 90, 220, 0.25), inset 0 1px 0 rgba(255,255,255,0.9)",
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
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "96%": { transform: "scaleY(0.1)" },
        },
        "tail-sway": {
          "0%, 100%": { transform: "rotate(-8deg)" },
          "50%": { transform: "rotate(10deg)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.25", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "scan-sweep": "scan-sweep 1.1s linear",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
        "gradient-drift": "gradient-drift 16s ease infinite",
        "float-slow": "float-y 7s ease-in-out infinite",
        "float-med": "float-y 5s ease-in-out infinite",
        "pop-in": "pop-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
        blink: "blink 4.5s ease-in-out infinite",
        "tail-sway": "tail-sway 2.4s ease-in-out infinite",
        twinkle: "twinkle 2.6s ease-in-out infinite",
        bob: "bob 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
