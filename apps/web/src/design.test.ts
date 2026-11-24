import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLORS } from "@buildapps/core";

/** The web stylesheet must use exactly the shared design tokens. */
describe("web CSS follows the shared design tokens", () => {
  const css = readFileSync(new URL("./app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  it.each(Object.entries(COLORS))("--%s matches", (key, value) => {
    const m = root.match(new RegExp(`--${kebab(key)}:\\s*(#[0-9a-fA-F]{6})`));
    expect(m?.[1]?.toLowerCase(), key).toBe(value);
  });
  it("respects reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
