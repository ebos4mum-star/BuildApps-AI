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
    ).toEqual(["week-streak", "first-verified-milestone"]);
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
