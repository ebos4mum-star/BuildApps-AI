import {
  ACHIEVEMENTS,
  allQuestStatuses,
  comeback,
  dailyGoal,
  weeklySummary,
  GOAL_FOCUS_SKILLS,
  PLACEMENT_CANDIDATES,
  type Comeback,
  type DailyGoal,
  type LearnerProfile,
  type WeeklySummary,
  getStreakStatus,
  levelFromXp,
  xpForLevel,
} from "@buildapps/core";
import {
  buildLearningPath,
  curriculum,
  findExercise,
  getLesson,
  toClientExercise,
  isExerciseUnlocked,
  type ClientExercise,
  type LearningPath,
} from "@buildapps/lessons";
import type { ProgressStore, StoredProfile } from "./store";

export interface Plan {
  /** Path the learner is guided into first. */
  pathId: "beginner" | "intermediate" | "advanced";
  /** Next lesson that fits the learner's goals, if one is available. */
  focusLessonId: string | null;
  /** Skills the learner may prove they already know (no XP or mastery is awarded for these). */
  placementOffers: string[];
  /** Whether to point the learner at their project workspace first. */
  projectFirst: boolean;
  headline: string;
}

export interface Dashboard {
  profile: LearnerProfile | null;
  plan: Plan | null;
  dailyGoal: DailyGoal;
  weekly: WeeklySummary;
  comeback: Comeback | null;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streak: { displayed: number; longest: number; status: string; restDaysAvailable: number };
  path: LearningPath;
  skillNames: Record<string, string>;
  achievements: { id: string; name: string; earned: boolean }[];
  quests: {
    id: string;
    name: string;
    description: string;
    period: "daily" | "weekly";
    progress: number;
    target: number;
    complete: boolean;
    rewardXp: number;
  }[];
}

function withUnavailable(path: LearningPath, disabled: ReadonlySet<string>): LearningPath {
  if (disabled.size === 0) return path;
  return {
    ...path,
    nextLessonId: path.nextLessonId && disabled.has(path.nextLessonId) ? null : path.nextLessonId,
    units: path.units.map((u) => ({
      ...u,
      lessons: u.lessons.map((l) =>
        disabled.has(l.id) ? { ...l, status: "locked" as const, unavailable: true } : l,
      ),
    })),
  };
}

/** Personalized starting point. Pure: depends only on the profile and what the learner has already done. */
export function buildPlan(
  profile: LearnerProfile,
  path: LearningPath,
  disabled: ReadonlySet<string>,
  placedOut: ReadonlySet<string> = new Set(),
): Plan {
  const skills = new Map(path.skills.map((k) => [k.skillId, k]));
  const lessons = path.units.flatMap((u) => u.lessons);
  const open = (l: { id: string; status: string }) =>
    (l.status === "available" || l.status === "in_progress") && !disabled.has(l.id);
  const focusSkills = [...new Set(profile.goals.flatMap((g) => GOAL_FOCUS_SKILLS[g]))];
  const focus =
    focusSkills
      .map((id) => lessons.find((l) => l.skillId === id && open(l)))
      .find((l) => l !== undefined) ?? lessons.find(open);
  const placementOffers =
    profile.experience === "new"
      ? []
      : PLACEMENT_CANDIDATES.filter((id) => {
          const k = skills.get(id);
          return !!k && k.unlocked && k.level === "none" && !placedOut.has(id);
        });
  const pathId = profile.experience === "experienced" ? "intermediate" : "beginner";
  const projectFirst = profile.intent === "continue" || profile.intent === "rescue";
  return {
    pathId,
    focusLessonId: focus?.id ?? null,
    placementOffers,
    projectFirst,
    headline: projectFirst
      ? profile.intent === "rescue"
        ? "Scan your project first, then learn exactly what it needs."
        : "Open your project, then learn what will move it forward."
      : profile.experience === "experienced"
        ? "Skip what you know with a quick check, then build on it."
        : "Start with the basics and build a real project step by step.",
  };
}

export async function getDashboard(
  store: ProgressStore,
  userId: string,
  now = new Date(),
  disabledLessons: ReadonlySet<string> = new Set(),
  stored: StoredProfile | null = null,
): Promise<Dashboard> {
  const s = await store.load(userId, "");
  const level = levelFromXp(s.totalXp);
  const st = getStreakStatus(s.streak, now, s.timeZone);
  const path = withUnavailable(
    buildLearningPath(s.passedExerciseIds, s.placedOut),
    disabledLessons,
  );
  return {
    profile: stored?.profile ?? null,
    plan: stored ? buildPlan(stored.profile, path, disabledLessons, s.placedOut) : null,
    dailyGoal: dailyGoal(s.recentExerciseAwards, stored?.profile.pace ?? "steady", now, s.timeZone),
    weekly: weeklySummary(s.recentExerciseAwards, now, s.timeZone),
    comeback: s.totalXp > 0 ? comeback(s.streak.lastActiveDay, now, s.timeZone) : null,
    totalXp: s.totalXp,
    level,
    xpIntoLevel: s.totalXp - xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1) - xpForLevel(level),
    streak: {
      displayed: st.displayedCurrent,
      longest: s.streak.longest,
      status: st.status,
      restDaysAvailable: s.streak.restDaysAvailable,
    },
    path,
    skillNames: Object.fromEntries(curriculum.skills.map((k) => [k.id, k.name])),
    achievements: ACHIEVEMENTS.map((a) => ({
      id: a.id,
      name: a.name,
      earned: s.earnedAchievements.has(a.id),
    })),
    quests: allQuestStatuses(s.recentExerciseAwards, now, s.timeZone).map((q) => ({
      id: q.quest.id,
      name: q.quest.name,
      description: q.quest.description,
      period: q.quest.period,
      progress: Math.min(q.progress, q.quest.target),
      target: q.quest.target,
      complete: q.complete,
      rewardXp: q.quest.rewardXp,
    })),
  };
}

export interface LessonPayload {
  id: string;
  title: string;
  hook: string;
  exercises: ClientExercise[];
  passedExerciseIds: string[];
}

export const PRACTICE_ID = "practice";
const PRACTICE_SIZE = 5;

/**
 * Personalized practice: review exercises the learner already passed, drawn from their weakest skills
 * (lowest progress to the next level first), rotated daily so it is not the same set every time.
 * Replays earn no XP (awards are idempotent) but still count as learning activity for streaks.
 */
export async function getPractice(
  store: ProgressStore,
  userId: string,
  now = new Date(),
  disabledLessons: ReadonlySet<string> = new Set(),
): Promise<LessonPayload | null> {
  const s = await store.load(userId, "");
  const path = buildLearningPath(s.passedExerciseIds, s.placedOut);
  const weakest = path.skills
    .filter((k) => k.unlocked)
    .sort((a, b) => a.progressToNext - b.progressToNext || a.skillId.localeCompare(b.skillId));
  const day = Math.floor(now.getTime() / 86_400_000);
  const picked: string[] = [];
  for (const k of weakest) {
    const pool = curriculum.lessons
      .filter((l) => l.skillId === k.skillId && !disabledLessons.has(l.id))
      .flatMap((l) => l.exercises)
      .filter((e) => s.passedExerciseIds.has(e.id));
    if (pool.length === 0) continue;
    const start = day % pool.length;
    for (let i = 0; i < pool.length && picked.length < PRACTICE_SIZE; i++) {
      const id = pool[(start + i) % pool.length]!.id;
      if (!picked.includes(id)) picked.push(id);
      if (i >= 1) break; // at most two per skill so practice spans skills
    }
    if (picked.length >= PRACTICE_SIZE) break;
  }
  if (picked.length === 0) return null;
  const exercises = picked.map((id) => findExercise(id)!.exercise);
  return {
    id: PRACTICE_ID,
    title: "Practice",
    hook: "A quick review of skills you are still building. No new XP - just sharper instincts.",
    exercises: exercises.map(toClientExercise),
    passedExerciseIds: [],
  };
}

/** Returns a lesson with solutions stripped, or null if unknown/locked. */
export async function getLessonForUser(
  store: ProgressStore,
  userId: string,
  lessonId: string,
  disabledLessons: ReadonlySet<string> = new Set(),
): Promise<LessonPayload | null> {
  if (lessonId === PRACTICE_ID) return getPractice(store, userId, new Date(), disabledLessons);
  const lesson = getLesson(lessonId);
  if (!lesson || disabledLessons.has(lessonId)) return null;
  const s = await store.load(userId, "");
  if (!isExerciseUnlocked(lesson.exercises[0]!.id, s.passedExerciseIds, s.placedOut)) return null;
  return {
    id: lesson.id,
    title: lesson.title,
    hook: lesson.hook,
    exercises: lesson.exercises.map(toClientExercise),
    passedExerciseIds: lesson.exercises
      .filter((e) => s.passedExerciseIds.has(e.id))
      .map((e) => e.id),
  };
}
