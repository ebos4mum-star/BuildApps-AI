import { diffDays, toDayKey, type DayKey } from "./dates";

/**
 * Recurring quests. Progress is a pure function of server-recorded exercise awards, so it cannot be
 * inflated by clients. Each quest period has its own reward key, so a reward is granted once per period.
 */
export interface PeriodicQuest {
  id: string;
  name: string;
  description: string;
  period: "daily" | "weekly";
  metric: "exercises" | "active_days" | "xp";
  target: number;
  rewardXp: number;
}

export const PERIODIC_QUESTS: readonly PeriodicQuest[] = [
  {
    id: "daily-practice",
    name: "Daily practice",
    description: "Pass 3 exercises today.",
    period: "daily",
    metric: "exercises",
    target: 3,
    rewardXp: 15,
  },
  {
    id: "daily-focus",
    name: "Focus session",
    description: "Earn 40 XP today.",
    period: "daily",
    metric: "xp",
    target: 40,
    rewardXp: 15,
  },
  {
    id: "weekly-steady",
    name: "Steady builder",
    description: "Learn on 4 different days this week.",
    period: "weekly",
    metric: "active_days",
    target: 4,
    rewardXp: 60,
  },
  {
    id: "weekly-volume",
    name: "Weekly sprint",
    description: "Pass 15 exercises this week.",
    period: "weekly",
    metric: "exercises",
    target: 15,
    rewardXp: 80,
  },
];

/** Monday of the learning week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
}

export function periodKey(q: PeriodicQuest, now: Date | string, tz: string): string {
  const day = toDayKey(now, tz);
  return q.period === "daily" ? day : weekStart(day);
}

export interface QuestStatus {
  quest: PeriodicQuest;
  periodKey: string;
  progress: number;
  complete: boolean;
}

export interface ExerciseAward {
  occurredAt: string;
  xp: number;
}

export function questStatus(
  q: PeriodicQuest,
  awards: readonly ExerciseAward[],
  now: Date | string,
  tz: string,
): QuestStatus {
  const key = periodKey(q, now, tz);
  const inPeriod = awards.filter((a) => {
    const d = toDayKey(a.occurredAt, tz);
    return q.period === "daily" ? d === key : diffDays(key, d) >= 0 && diffDays(key, d) < 7;
  });
  const progress =
    q.metric === "exercises"
      ? inPeriod.length
      : q.metric === "xp"
        ? inPeriod.reduce((s, a) => s + a.xp, 0)
        : new Set(inPeriod.map((a) => toDayKey(a.occurredAt, tz))).size;
  return { quest: q, periodKey: key, progress, complete: progress >= q.target };
}

export const allQuestStatuses = (
  awards: readonly ExerciseAward[],
  now: Date | string,
  tz: string,
) => PERIODIC_QUESTS.map((q) => questStatus(q, awards, now, tz));
