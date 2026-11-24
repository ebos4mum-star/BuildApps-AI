import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  categoryOfKind,
  inQuietHours,
  parsePrefs,
  shouldDeliver,
  weekKey,
} from "./notify";

const on = { ...DEFAULT_PREFS, push: true, email: true };
const NOON = new Date("2026-03-10T12:00:00Z");
const LATE = new Date("2026-03-10T23:30:00Z");

describe("delivery rules", () => {
  it("in-app is always delivered", () => {
    expect(shouldDeliver(DEFAULT_PREFS, "project", "in_app", NOON, "UTC")).toEqual({ send: true });
  });
  it("push and email are off until the user opts in", () => {
    expect(shouldDeliver(DEFAULT_PREFS, "project", "push", NOON, "UTC")).toMatchObject({
      send: false,
      reason: "push_off",
    });
    expect(shouldDeliver(DEFAULT_PREFS, "project", "email", NOON, "UTC")).toMatchObject({
      send: false,
      reason: "email_off",
    });
    expect(shouldDeliver(on, "project", "push", NOON, "UTC").send).toBe(true);
  });
  it("categories can be switched off, except account safety", () => {
    const prefs = {
      ...on,
      categories: { ...on.categories, learning_reminder: false, security: false },
    };
    expect(shouldDeliver(prefs, "learning_reminder", "push", NOON, "UTC")).toMatchObject({
      reason: "category_off",
    });
    expect(shouldDeliver(prefs, "security", "email", NOON, "UTC").send).toBe(true);
  });
  it("push respects quiet hours in the user's own time zone; security does not", () => {
    expect(shouldDeliver(on, "project", "push", LATE, "UTC")).toMatchObject({
      reason: "quiet_hours",
    });
    expect(shouldDeliver(on, "project", "push", LATE, "Asia/Tokyo").send).toBe(true); // 08:30 there
    expect(shouldDeliver(on, "security", "push", LATE, "UTC").send).toBe(true);
    expect(shouldDeliver(on, "project", "email", LATE, "UTC").send).toBe(true);
  });
  it("handles same-day and overnight quiet windows", () => {
    expect(inQuietHours({ start: 13, end: 15 }, new Date("2026-03-10T14:00:00Z"), "UTC")).toBe(
      true,
    );
    expect(inQuietHours({ start: 22, end: 7 }, new Date("2026-03-10T06:00:00Z"), "UTC")).toBe(true);
    expect(inQuietHours(null, NOON, "UTC")).toBe(false);
  });
});

describe("preferences validation", () => {
  it("accepts valid input and forces account safety on", () => {
    const r = parsePrefs({
      push: true,
      email: false,
      categories: { security: false, project: false },
      quietHours: null,
    });
    expect(r.ok && r.prefs.categories.security).toBe(true);
    expect(r.ok && r.prefs.categories.project).toBe(false);
    expect(r.ok && r.prefs.quietHours).toBeNull();
  });
  it("rejects bad shapes", () => {
    for (const bad of [
      null,
      { push: "yes", email: true },
      { push: true, email: true, quietHours: { start: 25, end: 1 } },
      { push: true, email: true, categories: { project: "no" } },
    ])
      expect(parsePrefs(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe("helpers", () => {
  it("maps in-app kinds to categories", () => {
    expect(categoryOfKind("support")).toBe("support");
    expect(categoryOfKind("privacy")).toBe("security");
    expect(categoryOfKind("unknown-thing")).toBe("project");
  });
  it("week keys start on Monday", () => {
    expect(weekKey(new Date("2026-03-10T12:00:00Z"), "UTC")).toBe("2026-03-09");
    expect(weekKey(new Date("2026-03-15T23:00:00Z"), "UTC")).toBe("2026-03-09");
    expect(weekKey(new Date("2026-03-16T00:30:00Z"), "UTC")).toBe("2026-03-16");
  });
});
