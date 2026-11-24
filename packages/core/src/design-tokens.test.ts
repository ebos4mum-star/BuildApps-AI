import { describe, expect, it } from "vitest";
import { COLORS, contrast } from "./design-tokens";

describe("design tokens", () => {
  it("text colors meet WCAG AA (4.5:1) on every surface they are used on", () => {
    for (const bg of [COLORS.bg, COLORS.surface, COLORS.surface2])
      for (const fg of [COLORS.text, COLORS.muted])
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
  it("dark ink on bright accent buttons meets AA", () => {
    for (const bg of [COLORS.mint, COLORS.sun, COLORS.sky])
      expect(contrast(COLORS.ink, bg), bg).toBeGreaterThanOrEqual(4.5);
  });
  it("computes known ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});
