import { describe, expect, it } from "vitest";
import { diffDays, isDayKey, toDayKey } from "./dates";
import { getStreakStatus, INITIAL_STREAK, recordActivity, type StreakState } from "./streak";

const run = (times: string[], tz = "UTC", s: StreakState = INITIAL_STREAK) =>
  times.reduce((st, t) => recordActivity(st, t, tz).state, s);

describe("dates", () => {
  it("uses local calendar day in the given timezone", () => {
    const t = "2026-03-01T03:30:00Z";
    expect(toDayKey(t, "UTC")).toBe("2026-03-01");
    expect(toDayKey(t, "America/Los_Angeles")).toBe("2026-02-28");
    expect(toDayKey(t, "Pacific/Auckland")).toBe("2026-03-01");
  });
  it("handles DST transition days", () => {
    expect(toDayKey("2026-03-08T09:30:00Z", "America/New_York")).toBe("2026-03-08");
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
  });
  it("validates", () => {
    expect(() => toDayKey("2026-01-01T00:00:00Z", "Mars/Base")).toThrow(RangeError);
    expect(() => toDayKey("garbage", "UTC")).toThrow();
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-02-28")).toBe(true);
  });
});

describe("streaks", () => {
  it("starts, extends, and ignores duplicate same-day activity", () => {
    let r = recordActivity(INITIAL_STREAK, "2026-01-01T08:00:00Z", "UTC");
    expect(r.outcome).toBe("started");
    r = recordActivity(r.state, "2026-01-01T22:00:00Z", "UTC");
    expect(r.outcome).toBe("already_counted");
    r = recordActivity(r.state, "2026-01-02T00:00:01Z", "UTC");
    expect(r.state.current).toBe(2);
  });
  it("counts day boundaries by local midnight, not 24h", () => {
    const s = run(["2026-01-01T23:59:00Z", "2026-01-02T00:01:00Z"]);
    expect(s.current).toBe(2);
  });
  it("forgives a missed day using a rest day, without counting it", () => {
    const r = recordActivity(run(["2026-01-01T10:00:00Z"]), "2026-01-03T10:00:00Z", "UTC");
    expect(r).toMatchObject({ outcome: "extended_using_rest_days", restDaysUsed: 1 });
    expect(r.state).toMatchObject({ current: 2, restDaysAvailable: 0 });
  });
  it("restarts when rest days run out but keeps longest", () => {
    const s = run(["2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z", "2026-01-03T10:00:00Z"]);
    const r = recordActivity(s, "2026-01-10T10:00:00Z", "UTC");
    expect(r.outcome).toBe("restarted");
    expect(r.state).toMatchObject({ current: 1, longest: 3 });
  });
  it("earns a rest day every 7 days, capped at 2", () => {
    const days = Array.from(
      { length: 21 },
      (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    );
    expect(run(days).restDaysAvailable).toBe(2);
  });
  it("timezone change never reduces or double counts", () => {
    // Day 1 in Auckland (Jan 2 local), then same instant-day in LA (Jan 1 local): no change.
    const s1 = recordActivity(INITIAL_STREAK, "2026-01-01T20:00:00Z", "Pacific/Auckland").state; // Jan 2
    expect(s1.lastActiveDay).toBe("2026-01-02");
    const r = recordActivity(s1, "2026-01-02T05:00:00Z", "America/Los_Angeles"); // Jan 1 local
    expect(r.outcome).toBe("already_counted");
    expect(r.state).toBe(s1);
  });
  it("out-of-order older activity is ignored", () => {
    const s = run(["2026-01-05T10:00:00Z"]);
    expect(recordActivity(s, "2026-01-01T10:00:00Z", "UTC").state).toBe(s);
  });
  it("status display is read-only and non-punitive within rest-day allowance", () => {
    const s = run(["2026-01-01T10:00:00Z"]);
    expect(getStreakStatus(INITIAL_STREAK, "2026-01-01T00:00:00Z", "UTC").status).toBe("none");
    expect(getStreakStatus(s, "2026-01-01T20:00:00Z", "UTC").status).toBe("completed_today");
    expect(getStreakStatus(s, "2026-01-03T10:00:00Z", "UTC")).toEqual({
      status: "active",
      displayedCurrent: 1,
    });
    expect(getStreakStatus(s, "2026-01-09T10:00:00Z", "UTC")).toEqual({
      status: "lapsed",
      displayedCurrent: 0,
    });
  });
  it("rejects corrupt state", () => {
    expect(() =>
      recordActivity(
        { ...INITIAL_STREAK, lastActiveDay: "bad", current: 1 },
        "2026-01-01T00:00:00Z",
        "UTC",
      ),
    ).toThrow();
  });
});
