import { describe, expect, it } from "vitest";
import {
  computeAward,
  levelFromXp,
  xpForLevel,
  DAILY_EXERCISE_XP_CAP,
  type AwardContext,
  type AwardRequest,
} from "./xp";

const ctx = (o: Partial<AwardContext> = {}): AwardContext => ({
  existingAwardKeys: new Set(),
  exerciseXpEarnedToday: 0,
  timeZone: "UTC",
  ...o,
});
const ex = (o: Partial<Extract<AwardRequest, { source: "exercise" }>> = {}): AwardRequest => ({
  source: "exercise",
  userId: "u1",
  exerciseId: "e1",
  difficulty: 2,
  passed: true,
  attemptNumber: 1,
  occurredAt: "2026-01-01T10:00:00Z",
  ...o,
});

describe("exercise XP", () => {
  it("awards base + first-try bonus", () => {
    const r = computeAward(ex(), ctx());
    expect(r).toMatchObject({ status: "awarded", award: { xp: 25, awardKey: "exercise:e1" } });
  });
  it("awards no bonus on retries", () => {
    expect(computeAward(ex({ attemptNumber: 3 }), ctx())).toMatchObject({ award: { xp: 20 } });
  });
  it("awards nothing for failed attempts", () => {
    expect(computeAward(ex({ passed: false }), ctx())).toEqual({
      status: "no_award",
      reason: "not_passed",
    });
  });
  it("is idempotent: replays and re-passes are duplicates", () => {
    const first = computeAward(ex(), ctx());
    if (first.status !== "awarded") throw new Error("expected award");
    const again = computeAward(
      ex({ attemptNumber: 2 }),
      ctx({ existingAwardKeys: new Set([first.award.awardKey]) }),
    );
    expect(again).toEqual({ status: "duplicate", awardKey: "exercise:e1" });
  });
  it("is deterministic", () => {
    expect(computeAward(ex(), ctx())).toEqual(computeAward(ex(), ctx()));
  });
  it("enforces the daily cap, partially awarding the remainder", () => {
    expect(
      computeAward(ex(), ctx({ exerciseXpEarnedToday: DAILY_EXERCISE_XP_CAP - 5 })),
    ).toMatchObject({ award: { xp: 5 } });
    expect(computeAward(ex(), ctx({ exerciseXpEarnedToday: DAILY_EXERCISE_XP_CAP }))).toEqual({
      status: "no_award",
      reason: "daily_cap_reached",
    });
  });
  it("rejects invalid input", () => {
    expect(() => computeAward(ex({ attemptNumber: 0 }), ctx())).toThrow();
    expect(() => computeAward(ex({ userId: "" }), ctx())).toThrow();
    expect(() => computeAward(ex({ occurredAt: "nope" }), ctx())).toThrow();
    expect(() => computeAward({ ...ex(), difficulty: 9 } as never, ctx())).toThrow();
  });
});

describe("skill and milestone XP", () => {
  it("awards a skill level once", () => {
    const req: AwardRequest = {
      source: "skill_demonstration",
      userId: "u1",
      skillId: "git",
      level: "beginner",
      occurredAt: new Date(),
    };
    const r = computeAward(req, ctx());
    expect(r).toMatchObject({ award: { xp: 50, awardKey: "skill:git:beginner" } });
    expect(
      computeAward(req, ctx({ existingAwardKeys: new Set(["skill:git:beginner"]) })).status,
    ).toBe("duplicate");
  });
  const ms = (o = {}): AwardRequest => ({
    source: "project_milestone",
    userId: "u1",
    projectId: "p1",
    milestoneId: "m1",
    completionSource: "verified",
    occurredAt: new Date(),
    ...o,
  });
  it("gives no XP for user-reported milestones but still allows a later verified award", () => {
    expect(computeAward(ms({ completionSource: "user_reported" }), ctx())).toEqual({
      status: "no_award",
      reason: "not_verified",
    });
    expect(computeAward(ms(), ctx())).toMatchObject({
      award: { xp: 100, awardKey: "milestone:p1:m1" },
    });
  });
  it("caps milestone xpValue", () => {
    expect(() => computeAward(ms({ xpValue: 100000 }), ctx())).toThrow();
  });
});

describe("levels", () => {
  it("maps xp to levels at boundaries", () => {
    expect([0, 99, 100, 299, 300].map(levelFromXp)).toEqual([1, 1, 2, 2, 3]);
    expect(xpForLevel(4)).toBe(600);
  });
  it("validates input", () => {
    expect(() => levelFromXp(-1)).toThrow();
    expect(() => xpForLevel(0)).toThrow();
  });
});
