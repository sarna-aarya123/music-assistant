// Subtle per-mood tint. These are hints layered over the user's chosen colorway, not themes.
const MOOD_RGB: Record<string, [number, number, number]> = {
  Aggressive: [255, 60, 60],
  Energetic: [255, 150, 40],
  Dark: [150, 70, 255],
  Uplifting: [70, 220, 170],
  Moody: [70, 110, 255],
  Chill: [70, 200, 230],
};

/** "r g b" triplet for use as `rgb(var(--mood-rgb) / alpha)`, or null when there's no mood. */
export function moodTriplet(label: string): string | null {
  const c = MOOD_RGB[label];
  return c ? c.join(" ") : null;
}

/** Literal `rgb(r,g,b)` for three.js / canvas, or null when there's no mood. */
export function moodColor(label: string): string | null {
  const c = MOOD_RGB[label];
  return c ? `rgb(${c.join(",")})` : null;
}
