import { describe, expect, it } from "vitest";
import {
  applyQuestEvent,
  evaluateAchievements,
  isQuestComplete,
  rewardAward,
  type QuestDefinition,
  type UserStats,
} from "./gamification";
import { computeAward } from "./xp";

const stats: UserStats = {
  exercisesCompleted: 1,
  currentStreak: 1,
  longestStreak: 1,
  skillsAtIntermediate: 0,
  skillsAtAdvanced: 0,
  verifiedMilestones: 0,
  verifiedProjectsCompleted: 0,
  debugCasesCompleted: 0,
  guidedProjectsCompleted: 0,
  pathsCompleted: 0,
  totalXp: 25,
};

describe("achievements", () => {
  it("returns only newly satisfied, unearned achievements", () => {
    expect(evaluateAchievements(stats, new Set()).map((a) => a.id)).toEqual(["first-exercise"]);
    expect(evaluateAchievements(stats, new Set(["first-exercise"]))).toEqual([]);
    expect(
      evaluateAchievements(
        { ...stats, longestStreak: 7, verifiedMilestones: 1 },
        new Set(["first-exercise"]),
      ).map((a) => a.id),
    ).toEqual(["three-day-streak", "week-streak", "first-verified-milestone"]);
  });
});

describe("quests", () => {
  const q: QuestDefinition = {
    id: "q1",
    name: "Warm up",
    rewardXp: 40,
    objectives: [{ id: "o1", event: "exercise_completed", target: 2 }],
  };
  it("tracks progress, caps at target, and ignores unrelated events", () => {
    let p = applyQuestEvent(q, {}, "scan_reviewed");
    expect(isQuestComplete(q, p)).toBe(false);
    p = applyQuestEvent(q, applyQuestEvent(q, p, "exercise_completed"), "exercise_completed");
    p = applyQuestEvent(q, p, "exercise_completed");
    expect(p).toEqual({ o1: 2 });
    expect(isQuestComplete(q, p)).toBe(true);
  });
  it("quest rewards are idempotent XP awards", () => {
    const req = rewardAward("u1", "quest", "q1", q.rewardXp, new Date());
    const ctx = { existingAwardKeys: new Set<string>(), exerciseXpEarnedToday: 0, timeZone: "UTC" };
    const first = computeAward(req, ctx);
    expect(first).toMatchObject({
      status: "awarded",
      award: { xp: 40, awardKey: "reward:quest:q1" },
    });
    expect(
      computeAward(req, { ...ctx, existingAwardKeys: new Set(["reward:quest:q1"]) }).status,
    ).toBe("duplicate");
  });
});

import { questStatus, PERIODIC_QUESTS, weekStart } from "./quests";
describe("periodic quests", () => {
  const q = (id: string) => PERIODIC_QUESTS.find((x) => x.id === id)!;
  const a = (iso: string, xp = 10) => ({ occurredAt: iso, xp });
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
  });
  it("daily counts only today in the learner's timezone", () => {
    const now = "2026-11-23T12:00:00Z";
    const s = questStatus(
      q("daily-practice"),
      [a("2026-11-23T01:00:00Z"), a("2026-11-22T11:00:00Z"), a(now), a(now)],
      now,
      "UTC",
    );
    expect(s.progress).toBe(3);
    expect(s.complete).toBe(true);
    expect(questStatus(q("daily-practice"), [a("2026-11-23T01:00:00Z")], now, "UTC").complete).toBe(
      false,
    );
  });
  it("weekly active days counts distinct days in the week", () => {
    const now = "2026-11-26T12:00:00Z";
    const s = questStatus(
      q("weekly-steady"),
      [
        a("2026-11-23T10:00:00Z"),
        a("2026-11-23T11:00:00Z"),
        a("2026-11-25T10:00:00Z"),
        a("2026-11-22T10:00:00Z"),
      ],
      now,
      "UTC",
    );
    expect(s.progress).toBe(2);
  });
});

describe("learning-content achievements", () => {
  it("are earned from debug cases, guided projects and completed paths", () => {
    const ids = (s: Partial<UserStats>) =>
      evaluateAchievements({ ...stats, exercisesCompleted: 0, ...s }, new Set()).map((a) => a.id);
    expect(ids({ debugCasesCompleted: 1 })).toContain("case-closed");
    expect(ids({ debugCasesCompleted: 5 })).toContain("detective");
    expect(ids({ guidedProjectsCompleted: 3 })).toEqual(
      expect.arrayContaining(["first-guided-project", "all-guided-projects"]),
    );
    expect(ids({ pathsCompleted: 1 })).toContain("path-graduate");
    expect(ids({})).not.toContain("case-closed");
  });
});
