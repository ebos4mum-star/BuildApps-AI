import { diffDays, toDayKey } from "./dates";
import { DAILY_GOAL_XP, type Pace } from "./profile";

export interface DailyGoal {
  targetXp: number;
  todayXp: number;
  met: boolean;
}
export interface WeeklySummary {
  xp: number;
  activeDays: number;
  exercises: number;
  /** Days covered, always 7, ending today. */
  days: { day: string; xp: number }[];
}
export interface Comeback {
  daysAway: number;
}
type Award = { occurredAt: string; xp: number };

/** Daily goal progress from server-recorded exercise awards, in the learner's own time zone. */
export function dailyGoal(awards: readonly Award[], pace: Pace, now: Date, tz: string): DailyGoal {
  const today = toDayKey(now, tz);
  const todayXp = awards
    .filter((a) => toDayKey(a.occurredAt, tz) === today)
    .reduce((s, a) => s + a.xp, 0);
  const targetXp = DAILY_GOAL_XP[pace];
  return { targetXp, todayXp, met: todayXp >= targetXp };
}

/** Seven calendar days ending today; purely descriptive, nothing is lost for a quiet week. */
export function weeklySummary(awards: readonly Award[], now: Date, tz: string): WeeklySummary {
  const todayKey = toDayKey(now, tz);
  const byDay = new Map<string, number>();
  let exercises = 0;
  for (const a of awards) {
    const k = toDayKey(a.occurredAt, tz);
    const ago = diffDays(k, todayKey);
    if (ago < 0 || ago > 6) continue;
    byDay.set(k, (byDay.get(k) ?? 0) + a.xp);
    exercises += 1;
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = toDayKey(new Date(now.getTime() - (6 - i) * 86_400_000), tz);
    return { day, xp: byDay.get(day) ?? 0 };
  });
  return {
    xp: days.reduce((s, d) => s + d.xp, 0),
    activeDays: days.filter((d) => d.xp > 0).length,
    exercises,
    days,
  };
}

/** A gentle welcome back after a break of 3+ days. Never a penalty, and nothing is taken away. */
export function comeback(
  lastActiveDay: string | null,
  now: Date,
  tz: string,
  minDays = 3,
): Comeback | null {
  if (!lastActiveDay) return null;
  const away = diffDays(lastActiveDay, toDayKey(now, tz));
  return away >= minDays ? { daysAway: away } : null;
}
