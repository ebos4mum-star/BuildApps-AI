import {
  ACHIEVEMENTS,
  allQuestStatuses,
  getStreakStatus,
  levelFromXp,
  xpForLevel,
} from "@buildapps/core";
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

export async function getDashboard(
  store: ProgressStore,
  userId: string,
  now = new Date(),
  disabledLessons: ReadonlySet<string> = new Set(),
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
    path: withUnavailable(buildLearningPath(s.passedExerciseIds), disabledLessons),
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

/** Returns a lesson with solutions stripped, or null if unknown/locked. */
export async function getLessonForUser(
  store: ProgressStore,
  userId: string,
  lessonId: string,
  disabledLessons: ReadonlySet<string> = new Set(),
): Promise<LessonPayload | null> {
  const lesson = getLesson(lessonId);
  if (!lesson || disabledLessons.has(lessonId)) return null;
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
