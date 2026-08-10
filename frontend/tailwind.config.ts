import type { Config } from "tailwindcss";

// Placeholder dark theme — Phase 4 ("Polish" in PLAN.md) is where this gets a real visual
// identity matching the rage/plugg aesthetic (distortion/glitch accents, etc).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#141414",
        border: "#262626",
        accent: "#ff2d55",
        muted: "#8a8a8a",
      },
    },
  },
  plugins: [],
};

export default config;
