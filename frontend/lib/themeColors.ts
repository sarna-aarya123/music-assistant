// The scene palette, as literal colors for three.js. Matches the CSS variables in globals.css.
export type ThemeColors = {
  accent: string;
  /** Bone / off-white: the waveform slats. */
  bone: string;
  /** Dark charcoal: desk tops and the like. */
  charcoal: string;
  /** The seamless backdrop both scenes sit in. */
  void: string;
  ink: string;
};

export const PALETTE: ThemeColors = {
  accent: "#c2561f",
  bone: "#e6e1d6",
  charcoal: "#2b2b2e",
  void: "#b9b9b6",
  ink: "#141416",
};

/** Kept as a hook so scenes read their colors the same way they always have. */
export function useThemeColors(): ThemeColors {
  return PALETTE;
}
