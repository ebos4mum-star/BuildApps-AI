import {
  ACHIEVEMENTS,
  computeAward,
  computeSkillTree,
  evaluateAchievements,
  levelFromXp,
  recordActivity,
  rewardAward,
  toDayKey,
  assertValidTimeZone,
  SKILL_LEVELS,
  type AwardRequest,
  type AwardResult,
  type SkillLevel,
  type UserStats,
  type XpAward,
} from "@buildapps/core";
import {
  curriculum,
  evidenceFromPassed,
  findExercise,
  gradeExercise,
  isExerciseUnlocked,
  type GradeResult,
} from "@buildapps/lessons";
import type { ProgressState, ProgressStore } from "./store";

export class AttemptError extends Error {
  constructor(
    readonly code: "unknown_exercise" | "locked" | "invalid_answer" | "busy",
    message: string,
  ) {
    super(message);
  }
}

export interface AttemptOutcome extends GradeResult {
  alreadyCompleted: boolean;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: { current: number; longest: number; restDaysAvailable: number };
  newAchievements: { id: string; name: string }[];
  skillLevelUps: { skillId: string; level: SkillLevel }[];
}

const MAX_RETRIES = 6;
const rank = (l: SkillLevel) => SKILL_LEVELS.indexOf(l);

/**
 * The ONLY path that turns an answer into progress. The client sends just (exerciseId, answer);
 * pass/fail, XP, streaks and achievements are all decided here from authoritative state.
 */
export async function submitAttempt(
  store: ProgressStore,
  input: { userId: string; exerciseId: string; answer: unknown; timeZone?: string; now?: Date },
): Promise<AttemptOutcome> {
  const hit = findExercise(input.exerciseId);
  if (!hit) throw new AttemptError("unknown_exercise", "Unknown exercise");
  const now = input.now ?? new Date();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const state = await store.load(input.userId, input.exerciseId);

    // Timezone policy: use a validated client tz if given (and remember it); else the stored one.
    let tz = state.timeZone;
    if (input.timeZone && input.timeZone !== state.timeZone) {
      try {
        assertValidTimeZone(input.timeZone);
        tz = input.timeZone;
      } catch {
        /* ignore invalid client tz, keep stored */
      }
    }

    if (!isExerciseUnlocked(input.exerciseId, state.passedExerciseIds))
      throw new AttemptError("locked", "Complete the earlier lessons first");

    let grade: GradeResult;
    try {
      grade = gradeExercise(hit.exercise, input.answer);
    } catch {
      throw new AttemptError("invalid_answer", "Malformed answer");
    }

    const alreadyCompleted = state.passedExerciseIds.has(input.exerciseId);
    const passedAfter = new Set(state.passedExerciseIds);
    if (grade.correct) passedAfter.add(input.exerciseId);

    const awards: XpAward[] = [];
    const awardKeys = new Set(state.awardKeys);
    const collect = (req: AwardRequest, exerciseXpToday: number): AwardResult => {
      const r = computeAward(req, {
        existingAwardKeys: awardKeys,
        exerciseXpEarnedToday: exerciseXpToday,
        timeZone: tz,
      });
      if (r.status === "awarded") {
        awards.push(r.award);
        awardKeys.add(r.award.awardKey);
      }
      return r;
    };

    // 1) exercise XP (first pass only; daily cap computed in the learner's local day)
    const today = toDayKey(now, tz);
    const exerciseXpToday = state.recentExerciseAwards
      .filter((a) => toDayKey(a.occurredAt, tz) === today)
      .reduce((s, a) => s + a.xp, 0);
    if (grade.correct) {
      collect(
        {
          source: "exercise",
          userId: input.userId,
          exerciseId: input.exerciseId,
          difficulty: hit.exercise.difficulty,
          passed: true,
          attemptNumber: state.priorAttempts + 1,
          occurredAt: now,
        },
        exerciseXpToday,
      );
    }

    // 2) skill level-ups -> skill_demonstration awards (idempotent per skill+level)
    const before = computeSkillTree(curriculum.skills, evidenceFromPassed(state.passedExerciseIds));
    const afterTree = computeSkillTree(curriculum.skills, evidenceFromPassed(passedAfter));
    const skillLevelUps: AttemptOutcome["skillLevelUps"] = [];
    for (const [id, s] of afterTree) {
      if (rank(s.level) > rank(before.get(id)?.level ?? "none"))
        skillLevelUps.push({ skillId: id, level: s.level });
      for (const lvl of ["beginner", "intermediate", "advanced"] as const) {
        if (rank(s.level) >= rank(lvl))
          collect(
            {
              source: "skill_demonstration",
              userId: input.userId,
              skillId: id,
              level: lvl,
              occurredAt: now,
            },
            0,
          );
      }
    }

    // 3) streak: only a *passed* exercise counts as learning activity
    const streak = grade.correct ? recordActivity(state.streak, now, tz).state : state.streak;

    // 4) achievements from the post-attempt snapshot
    const xpNow = state.totalXp + awards.reduce((s, a) => s + a.xp, 0);
    const stats: UserStats = {
      exercisesCompleted: passedAfter.size,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      skillsAtIntermediate: [...afterTree.values()].filter(
        (s) => rank(s.level) >= rank("intermediate"),
      ).length,
      skillsAtAdvanced: [...afterTree.values()].filter((s) => s.level === "advanced").length,
      verifiedMilestones: state.verifiedMilestones,
      verifiedProjectsCompleted: state.verifiedProjectsCompleted,
      totalXp: xpNow,
    };
    const earned = evaluateAchievements(stats, state.earnedAchievements);
    for (const a of earned) {
      collect(rewardAward(input.userId, "achievement", a.id, a.rewardXp, now), 0);
    }

    const res = await store.apply({
      userId: input.userId,
      exerciseId: input.exerciseId,
      passed: grade.correct,
      expectedVersion: state.version,
      awards: awards.map((a) => ({
        awardKey: a.awardKey,
        source: a.source,
        xp: a.xp,
        occurredAt: a.occurredAt.toISOString(),
      })),
      achievements: earned.map((a) => a.id),
      streak,
    });
    if (res.status === "conflict") continue; // someone else wrote first: reload and recompute

    return {
      ...grade,
      alreadyCompleted,
      xpAwarded: res.xpAdded,
      totalXp: res.totalXp,
      level: levelFromXp(res.totalXp),
      streak: {
        current: streak.current,
        longest: streak.longest,
        restDaysAvailable: streak.restDaysAvailable,
      },
      newAchievements: earned.map((a) => ({ id: a.id, name: a.name })),
      skillLevelUps,
    };
  }
  throw new AttemptError("busy", "Please try again");
}

export type { ProgressState };
export { ACHIEVEMENTS };
