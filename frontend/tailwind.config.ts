import type { Config } from "tailwindcss";

// Paper-and-ink identity: warm off-white paper, near-black ink, one signal red. Flat, printed,
// no glow, no glass. Colors resolve through CSS variables (globals.css) so three.js and canvas
// code can read the exact same values the CSS uses.
const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: withOpacity("--color-background"),
        surface: withOpacity("--color-surface"),
        border: withOpacity("--color-border"),
        ink: withOpacity("--color-ink"),
        accent: withOpacity("--color-accent"),
        accent2: withOpacity("--color-accent2"),
        gold: withOpacity("--color-gold"),
        muted: withOpacity("--color-muted"),
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      // Square-ish, like cut paper — not the soft pill corners the old theme had.
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
        xl: "8px",
        full: "9999px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ink-rise": {
          "0%": { transform: "scaleY(0.04)" },
          "100%": { transform: "scaleY(1)" },
        },
        "caption-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "ink-rise": "ink-rise 1.1s cubic-bezier(0.45,0,0.2,1) infinite alternate",
        "caption-in": "caption-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
