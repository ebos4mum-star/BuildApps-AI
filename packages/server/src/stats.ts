import {
  ACHIEVEMENTS,
  allQuestStatuses,
  computeAward,
  computeSkillTree,
  evaluateAchievements,
  rewardAward,
  SKILL_LEVELS,
  type UserStats,
  type XpAward,
} from "@buildapps/core";
import { buildLearningPath, curriculum, evidenceFromPassed } from "@buildapps/lessons";
import type { ProgressState, ProgressStore } from "./store";

const rank = (l: string) => SKILL_LEVELS.indexOf(l as (typeof SKILL_LEVELS)[number]);

export function statsFromState(s: ProgressState, extraXp = 0): UserStats {
  const tree = computeSkillTree(
    curriculum.skills,
    evidenceFromPassed(s.passedExerciseIds),
    s.placedOut,
  );
  const doneLessons = curriculum.lessons.filter((l) =>
    l.exercises.every((e) => s.passedExerciseIds.has(e.id)),
  );
  const path = buildLearningPath(s.passedExerciseIds, s.placedOut);
  return {
    debugCasesCompleted: doneLessons.filter((l) => l.kind === "debug_challenge").length,
    guidedProjectsCompleted: doneLessons.filter((l) => l.kind === "guided_project").length,
    pathsCompleted: path.paths.filter((p) => p.lessonsDone === p.lessonsTotal).length,
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
  // Completed daily/weekly quests: one reward per quest per period (idempotent award key).
  const exerciseAwards = [
    ...state.recentExerciseAwards,
    ...extraAwards
      .filter((a) => a.source === "exercise")
      .map((a) => ({
        occurredAt: a.occurredAt.toISOString(),
        xp: a.xp,
      })),
  ];
  const questsDone: string[] = [];
  for (const q of allQuestStatuses(exerciseAwards, now, state.timeZone)) {
    if (!q.complete) continue;
    const r = computeAward(
      rewardAward(userId, "quest", `${q.quest.id}:${q.periodKey}`, q.quest.rewardXp, now),
      { existingAwardKeys: keys, exerciseXpEarnedToday: 0, timeZone: "UTC" },
    );
    if (r.status === "awarded") {
      awards.push(r.award);
      keys.add(r.award.awardKey);
      questsDone.push(q.quest.name);
    }
  }
  if (awards.length === 0 && earned.length === 0)
    return { xpAdded: 0, achievements: [] as string[], quests: [] as string[] };
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
  return { xpAdded: res.xpAdded, achievements: earned.map((a) => a.name), quests: questsDone };
}
export { ACHIEVEMENTS };
