import { describe, expect, it } from "vitest";
import { comeback, dailyGoal, weeklySummary } from "./engagement";

const NOW = new Date("2026-03-10T12:00:00Z");
const at = (daysAgo: number, xp: number) => ({
  occurredAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  xp,
});

describe("daily goal", () => {
  it("sums today's XP only and reports met at the pace target", () => {
    expect(dailyGoal([at(0, 10), at(0, 15), at(1, 99)], "light", NOW, "UTC")).toEqual({
      targetXp: 20,
      todayXp: 25,
      met: true,
    });
    expect(dailyGoal([at(0, 10)], "steady", NOW, "UTC").met).toBe(false);
    expect(dailyGoal([], "intense", NOW, "UTC")).toMatchObject({ targetXp: 80, todayXp: 0 });
  });
  it("uses the learner's time zone for what counts as today", () => {
    // 23:30 UTC on Mar 9 is already Mar 10 in Tokyo
    const late = [{ occurredAt: "2026-03-09T23:30:00Z", xp: 30 }];
    expect(dailyGoal(late, "light", NOW, "Asia/Tokyo").todayXp).toBe(30);
    expect(dailyGoal(late, "light", NOW, "UTC").todayXp).toBe(0);
  });
});

describe("weekly summary", () => {
  it("always covers 7 days and ignores older activity", () => {
    const w = weeklySummary([at(0, 10), at(2, 20), at(2, 5), at(6, 7), at(7, 500)], NOW, "UTC");
    expect(w.days).toHaveLength(7);
    expect(w.xp).toBe(42);
    expect(w.activeDays).toBe(3);
    expect(w.exercises).toBe(4);
    expect(w.days.at(-1)).toEqual({ day: "2026-03-10", xp: 10 });
  });
  it("an empty week is just zeros", () => {
    expect(weeklySummary([], NOW, "UTC")).toMatchObject({ xp: 0, activeDays: 0, exercises: 0 });
  });
});

describe("comeback", () => {
  it("appears after 3+ days away and never for new or recent learners", () => {
    expect(comeback("2026-03-05", NOW, "UTC")).toEqual({ daysAway: 5 });
    expect(comeback("2026-03-08", NOW, "UTC")).toBeNull();
    expect(comeback("2026-03-07", NOW, "UTC")).toEqual({ daysAway: 3 });
    expect(comeback(null, NOW, "UTC")).toBeNull();
  });
});
