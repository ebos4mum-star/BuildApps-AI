import { describe, expect, it } from "vitest";
import {
  computeSkillTree,
  validateSkillGraph,
  type SkillDefinition,
  type SkillEvidence,
} from "./skills";

const defs: SkillDefinition[] = [
  { id: "prompting", name: "Prompting", prerequisites: [] },
  { id: "git", name: "Git", prerequisites: [{ skillId: "prompting", minLevel: "beginner" }] },
];
let n = 0;
const ev = (
  skillId: string,
  difficulty: 1 | 2 | 3,
  kind: "exercise" | "project_verified" = "exercise",
): SkillEvidence => ({
  evidenceId: `e${n++}`,
  skillId,
  kind,
  difficulty,
});
const many = (skillId: string, count: number, d: 1 | 2 | 3) =>
  Array.from({ length: count }, () => ev(skillId, d));

describe("skill progression", () => {
  it("starts at none, then reaches beginner with enough evidence", () => {
    expect(computeSkillTree(defs, []).get("prompting")).toMatchObject({
      level: "none",
      nextLevel: "beginner",
    });
    const t = computeSkillTree(defs, many("prompting", 5, 1));
    expect(t.get("prompting")).toMatchObject({
      level: "beginner",
      points: 5,
      nextLevel: "intermediate",
    });
  });
  it("de-duplicates replayed evidence (no farming)", () => {
    const e = ev("prompting", 3);
    expect(computeSkillTree(defs, [e, e, e, e]).get("prompting")?.points).toBe(3);
  });
  it("needs harder evidence for intermediate, not just volume", () => {
    expect(computeSkillTree(defs, many("prompting", 20, 1)).get("prompting")?.level).toBe(
      "beginner",
    );
    expect(computeSkillTree(defs, many("prompting", 5, 3)).get("prompting")?.level).toBe(
      "intermediate",
    );
  });
  it("requires verified project evidence for advanced", () => {
    const base = many("prompting", 10, 3);
    expect(computeSkillTree(defs, base).get("prompting")?.level).toBe("intermediate");
    const adv = computeSkillTree(defs, [...base, ev("prompting", 3, "project_verified")]);
    expect(adv.get("prompting")).toMatchObject({
      level: "advanced",
      nextLevel: null,
      progressToNext: 1,
    });
  });
  it("locks skills until prerequisites are met", () => {
    const locked = computeSkillTree(defs, many("git", 6, 1));
    expect(locked.get("git")).toMatchObject({ unlocked: false, level: "none", points: 0 });
    const open = computeSkillTree(defs, [...many("prompting", 5, 1), ...many("git", 6, 1)]);
    expect(open.get("git")).toMatchObject({ unlocked: true, level: "beginner" });
  });
  it("ignores unknown skills and rejects invalid evidence", () => {
    expect(computeSkillTree(defs, [ev("ghost", 1)]).size).toBe(2);
    expect(() =>
      computeSkillTree(defs, [
        { evidenceId: "x", skillId: "git", kind: "exercise", difficulty: 7 as never },
      ]),
    ).toThrow();
  });
});

describe("skill graph validation", () => {
  it("rejects cycles, unknown prerequisites and duplicates", () => {
    expect(() =>
      validateSkillGraph([
        { id: "a", name: "a", prerequisites: [{ skillId: "b", minLevel: "beginner" }] },
        { id: "b", name: "b", prerequisites: [{ skillId: "a", minLevel: "beginner" }] },
      ]),
    ).toThrow(/cycle/);
    expect(() =>
      validateSkillGraph([
        { id: "a", name: "a", prerequisites: [{ skillId: "z", minLevel: "beginner" }] },
      ]),
    ).toThrow(/unknown/);
    expect(() => validateSkillGraph([defs[0]!, defs[0]!])).toThrow(/Duplicate/);
  });
});
