/**
 * BuildApps design tokens: the single source of truth for color, shape and motion on web, iOS and Android.
 * Web CSS variables and the mobile theme must match these (enforced by tests).
 */
export const COLORS = {
  bg: "#130f2a",
  surface: "#241e52",
  surface2: "#2e2765",
  line: "#3d3580",
  text: "#f7f5ff",
  muted: "#b9b3e6",
  mint: "#19d3a2",
  mintD: "#0e9f78",
  coral: "#ff6b7a",
  sun: "#ffc84a",
  sky: "#4cc9f0",
  violet: "#9b7bff",
  ink: "#08241c",
} as const;

export const RADIUS = { card: 18, button: 16, pill: 999 } as const;
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
/** Minimum touch target, in points/CSS px (Apple HIG 44, Material 48; we use the larger). */
export const MIN_TARGET = 48;
export const MOTION = { fastMs: 150, normalMs: 250, celebrateMs: 900 } as const;

/** WCAG relative luminance contrast ratio between two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
