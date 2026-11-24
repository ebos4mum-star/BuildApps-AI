import type { AwardRequest } from "./xp";

/** Snapshot of a user's server-computed stats; achievements/quests are pure functions of it. */
export interface UserStats {
  exercisesCompleted: number;
  currentStreak: number;
  longestStreak: number;
  skillsAtIntermediate: number;
  skillsAtAdvanced: number;
  verifiedMilestones: number;
  verifiedProjectsCompleted: number;
  totalXp: number;
}
export type StatKey = keyof UserStats;

export interface AchievementDefinition {
  id: string;
  name: string;
  criteria: { stat: StatKey; atLeast: number };
  rewardXp: number;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "ten-exercises",
    name: "Warmed Up",
    criteria: { stat: "exercisesCompleted", atLeast: 10 },
    rewardXp: 20,
  },
  {
    id: "fifty-exercises",
    name: "Practice Habit",
    criteria: { stat: "exercisesCompleted", atLeast: 50 },
    rewardXp: 60,
  },
  {
    id: "hundred-exercises",
    name: "Century",
    criteria: { stat: "exercisesCompleted", atLeast: 100 },
    rewardXp: 120,
  },
  {
    id: "three-day-streak",
    name: "On a Roll",
    criteria: { stat: "longestStreak", atLeast: 3 },
    rewardXp: 15,
  },
  {
    id: "month-streak",
    name: "Unstoppable",
    criteria: { stat: "longestStreak", atLeast: 30 },
    rewardXp: 200,
  },
  {
    id: "three-skills",
    name: "Well Rounded",
    criteria: { stat: "skillsAtIntermediate", atLeast: 3 },
    rewardXp: 60,
  },
  {
    id: "first-advanced",
    name: "Specialist",
    criteria: { stat: "skillsAtAdvanced", atLeast: 1 },
    rewardXp: 100,
  },
  {
    id: "xp-500",
    name: "Rising Builder",
    criteria: { stat: "totalXp", atLeast: 500 },
    rewardXp: 25,
  },
  {
    id: "xp-2000",
    name: "Seasoned Builder",
    criteria: { stat: "totalXp", atLeast: 2000 },
    rewardXp: 75,
  },
  {
    id: "first-exercise",
    name: "First Steps",
    criteria: { stat: "exercisesCompleted", atLeast: 1 },
    rewardXp: 10,
  },
  {
    id: "week-streak",
    name: "Week of Learning",
    criteria: { stat: "longestStreak", atLeast: 7 },
    rewardXp: 50,
  },
  {
    id: "first-verified-milestone",
    name: "Proof of Progress",
    criteria: { stat: "verifiedMilestones", atLeast: 1 },
    rewardXp: 50,
  },
  {
    id: "project-shipped-verified",
    name: "Verified Finish",
    criteria: { stat: "verifiedProjectsCompleted", atLeast: 1 },
    rewardXp: 200,
  },
];

export function evaluateAchievements(
  stats: UserStats,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDefinition[] = ACHIEVEMENTS,
): AchievementDefinition[] {
  return defs.filter((d) => !earnedIds.has(d.id) && stats[d.criteria.stat] >= d.criteria.atLeast);
}

export type ActivityEventType =
  "exercise_completed" | "milestone_verified" | "lesson_completed" | "scan_reviewed";

export interface QuestDefinition {
  id: string;
  name: string;
  objectives: readonly { id: string; event: ActivityEventType; target: number }[];
  rewardXp: number;
}

export type QuestProgress = Readonly<Record<string, number>>;

/** Progress is capped at each objective's target so replayed events cannot overshoot. */
export function applyQuestEvent(
  def: QuestDefinition,
  progress: QuestProgress,
  event: ActivityEventType,
): QuestProgress {
  const next: Record<string, number> = { ...progress };
  for (const o of def.objectives) {
    if (o.event === event) next[o.id] = Math.min(o.target, (next[o.id] ?? 0) + 1);
  }
  return next;
}

export function isQuestComplete(def: QuestDefinition, progress: QuestProgress): boolean {
  return (
    def.objectives.length > 0 && def.objectives.every((o) => (progress[o.id] ?? 0) >= o.target)
  );
}

/** Rewards are ordinary XP awards keyed by reward id, so they inherit idempotency + caps. */
export function rewardAward(
  userId: string,
  kind: "achievement" | "quest",
  id: string,
  xp: number,
  at: Date | string,
): AwardRequest {
  return { source: "reward", userId, rewardId: `${kind}:${id}`, xp, occurredAt: at };
}
