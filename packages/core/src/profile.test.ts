import { describe, expect, it } from "vitest";
import { computeSkillTree } from "./skills";
import { DAILY_GOAL_XP, parseProfile } from "./profile";

const valid = {
  experience: "some",
  goals: ["ship_first_app"],
  tools: ["claude_code", "cursor"],
  intent: "start",
  pace: "steady",
  projectTypes: ["web_app"],
  platforms: ["web", "ios"],
  reminders: { enabled: true, hour: 18 },
};

describe("parseProfile", () => {
  it("accepts a complete profile and de-duplicates choices", () => {
    const r = parseProfile({ ...valid, tools: ["cursor", "cursor"] });
    expect(r.ok && r.profile.tools).toEqual(["cursor"]);
  });
  it("rejects unknown values, missing required picks and bad reminder hours", () => {
    for (const bad of [
      { ...valid, experience: "wizard" },
      { ...valid, goals: [] },
      { ...valid, tools: ["skynet"] },
      { ...valid, pace: undefined },
      { ...valid, reminders: { enabled: true, hour: 25 } },
      { ...valid, reminders: { enabled: "yes", hour: 8 } },
      null,
    ])
      expect(parseProfile(bad).ok, JSON.stringify(bad)).toBe(false);
  });
  it("daily goals scale with pace and are positive", () => {
    expect(DAILY_GOAL_XP.light).toBeLessThan(DAILY_GOAL_XP.steady);
    expect(DAILY_GOAL_XP.steady).toBeLessThan(DAILY_GOAL_XP.intense);
  });
});

describe("placement in the skill tree", () => {
  const defs = [
    { id: "a", name: "A", prerequisites: [] },
    { id: "b", name: "B", prerequisites: [{ skillId: "a", minLevel: "beginner" as const }] },
    { id: "c", name: "C", prerequisites: [{ skillId: "b", minLevel: "beginner" as const }] },
  ];
  it("without placement, dependents stay locked", () => {
    const t = computeSkillTree(defs, []);
    expect(t.get("b")!.unlocked).toBe(false);
  });
  it("a placed-out skill unlocks its dependents but earns no level or points", () => {
    const t = computeSkillTree(defs, [], new Set(["a"]));
    expect(t.get("a")).toMatchObject({ unlocked: true, level: "none", points: 0 });
    expect(t.get("b")!.unlocked).toBe(true);
    expect(t.get("c")!.unlocked).toBe(false); // b itself was not placed out or earned
  });
  it("mastery still comes only from evidence", () => {
    const ev = Array.from({ length: 8 }, (_, i) => ({
      evidenceId: `e${i}`,
      skillId: "b",
      kind: "exercise" as const,
      difficulty: 2 as const,
    }));
    const t = computeSkillTree(defs, ev, new Set(["a"]));
    expect(t.get("b")!.level).not.toBe("none");
    expect(t.get("c")!.unlocked).toBe(true);
  });
});
