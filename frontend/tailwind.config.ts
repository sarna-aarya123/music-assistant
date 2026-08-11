import type { Config } from "tailwindcss";

// Phase 4 ("Polish" in PLAN.md) visual identity: dark, angular, distorted accents matching the
// rage/plugg reference artists rather than a generic SaaS dark theme.
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
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
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
      },
    },
  },
  plugins: [],
};

export default config;
