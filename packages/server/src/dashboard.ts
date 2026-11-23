import { ACHIEVEMENTS, getStreakStatus, levelFromXp, xpForLevel } from "@buildapps/core";
import {
  buildLearningPath,
  curriculum,
  getLesson,
  toClientExercise,
  isExerciseUnlocked,
  type ClientExercise,
  type LearningPath,
} from "@buildapps/lessons";
import type { ProgressStore } from "./store";

export interface Dashboard {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streak: { displayed: number; longest: number; status: string; restDaysAvailable: number };
  path: LearningPath;
  skillNames: Record<string, string>;
  achievements: { id: string; name: string; earned: boolean }[];
}

export async function getDashboard(
  store: ProgressStore,
  userId: string,
  now = new Date(),
): Promise<Dashboard> {
  const s = await store.load(userId, "");
  const level = levelFromXp(s.totalXp);
  const st = getStreakStatus(s.streak, now, s.timeZone);
  return {
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
    path: buildLearningPath(s.passedExerciseIds),
    skillNames: Object.fromEntries(curriculum.skills.map((k) => [k.id, k.name])),
    achievements: ACHIEVEMENTS.map((a) => ({
      id: a.id,
      name: a.name,
      earned: s.earnedAchievements.has(a.id),
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

/** Returns a lesson with solutions stripped, or null if unknown/locked. */
export async function getLessonForUser(
  store: ProgressStore,
  userId: string,
  lessonId: string,
): Promise<LessonPayload | null> {
  const lesson = getLesson(lessonId);
  if (!lesson) return null;
  const s = await store.load(userId, "");
  if (!isExerciseUnlocked(lesson.exercises[0]!.id, s.passedExerciseIds)) return null;
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
