import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLesson } from "@buildapps/lessons";
import { GUIDANCE } from "./finding-guidance";

describe("finding guidance", () => {
  const src = readFileSync(new URL("../../scanner/src/rules.ts", import.meta.url), "utf8");
  const ruleIds = [...src.matchAll(/ruleId: "([a-z0-9-]+)"/g)].map((m) => m[1]!);
  it("covers every scanner rule", () => {
    expect(ruleIds.length).toBeGreaterThan(25);
    expect(ruleIds.filter((id) => !GUIDANCE[id])).toEqual([]);
  });
  it("has no entries for rules that do not exist", () => {
    expect(Object.keys(GUIDANCE).filter((id) => !ruleIds.includes(id))).toEqual([]);
  });
  it("links real lessons, gives actionable steps and says what the rescan checks", () => {
    for (const [id, x] of Object.entries(GUIDANCE)) {
      expect(getLesson(x.lessonId), `${id} -> ${x.lessonId}`).toBeTruthy();
      expect(x.plain.length, id).toBeGreaterThan(40);
      expect(x.steps.length, id).toBeGreaterThanOrEqual(2);
      expect(x.verifiedBy.length, id).toBeGreaterThan(10);
    }
  });
});
