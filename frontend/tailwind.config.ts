import type { Config } from "tailwindcss";

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
        mono: ["var(--font-mono)", "Courier New", "monospace"],
      },
      // Square corners everywhere: these are labels and screens, not cards.
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        full: "9999px",
      },
      keyframes: {
        "bar-rise": {
          "0%": { transform: "scaleY(0.05)" },
          "100%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "bar-rise": "bar-rise 0.9s steps(6) infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
