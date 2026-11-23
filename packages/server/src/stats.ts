import {
  ACHIEVEMENTS,
  computeAward,
  computeSkillTree,
  evaluateAchievements,
  rewardAward,
  SKILL_LEVELS,
  type UserStats,
  type XpAward,
} from "@buildapps/core";
import { curriculum, evidenceFromPassed } from "@buildapps/lessons";
import type { ProgressState, ProgressStore } from "./store";

const rank = (l: string) => SKILL_LEVELS.indexOf(l as (typeof SKILL_LEVELS)[number]);

export function statsFromState(s: ProgressState, extraXp = 0): UserStats {
  const tree = computeSkillTree(curriculum.skills, evidenceFromPassed(s.passedExerciseIds));
  return {
    exercisesCompleted: s.passedExerciseIds.size,
    currentStreak: s.streak.current,
    longestStreak: s.streak.longest,
    skillsAtIntermediate: [...tree.values()].filter((k) => rank(k.level) >= rank("intermediate"))
      .length,
    skillsAtAdvanced: [...tree.values()].filter((k) => k.level === "advanced").length,
    verifiedMilestones: s.verifiedMilestones,
    verifiedProjectsCompleted: s.verifiedProjectsCompleted,
    totalXp: s.totalXp + extraXp,
  };
}

/** Grants any achievements newly earned from the user's current persisted state (idempotent). */
export async function syncAchievements(
  progress: ProgressStore,
  userId: string,
  now: Date,
  extraAwards: XpAward[] = [],
) {
  const state = await progress.load(userId, "");
  const awards = [...extraAwards];
  const keys = new Set(state.awardKeys);
  awards.forEach((a) => keys.add(a.awardKey));
  const earned = evaluateAchievements(
    statsFromState(
      state,
      awards.reduce((s, a) => s + a.xp, 0),
    ),
    state.earnedAchievements,
  );
  for (const a of earned) {
    const r = computeAward(rewardAward(userId, "achievement", a.id, a.rewardXp, now), {
      existingAwardKeys: keys,
      exerciseXpEarnedToday: 0,
      timeZone: "UTC",
    });
    if (r.status === "awarded") {
      awards.push(r.award);
      keys.add(r.award.awardKey);
    }
  }
  if (awards.length === 0 && earned.length === 0)
    return { xpAdded: 0, achievements: [] as string[] };
  const res = await progress.grant({
    userId,
    awards: awards.map((a) => ({
      awardKey: a.awardKey,
      source: a.source,
      xp: a.xp,
      occurredAt: a.occurredAt.toISOString(),
    })),
    achievements: earned.map((a) => a.id),
  });
  return { xpAdded: res.xpAdded, achievements: earned.map((a) => a.name) };
}
export { ACHIEVEMENTS };
