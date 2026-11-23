import { computeSkillTree, type SkillEvidence, type SkillState } from "@buildapps/core";
import { curriculum } from "./content";
import type { Exercise, Lesson } from "./types";

const lessonById = new Map(curriculum.lessons.map((l) => [l.id, l]));
const exerciseIndex = new Map<string, { lesson: Lesson; exercise: Exercise }>();
for (const lesson of curriculum.lessons)
  for (const exercise of lesson.exercises) exerciseIndex.set(exercise.id, { lesson, exercise });

export const getLesson = (id: string): Lesson | undefined => lessonById.get(id);
export const findExercise = (id: string) => exerciseIndex.get(id);

/** Each passed exercise is evidence for its lesson's skill; evidenceId = exerciseId so replays add nothing. */
export function evidenceFromPassed(passedExerciseIds: Iterable<string>): SkillEvidence[] {
  const out: SkillEvidence[] = [];
  for (const id of new Set(passedExerciseIds)) {
    const hit = exerciseIndex.get(id);
    if (hit)
      out.push({
        evidenceId: id,
        skillId: hit.lesson.skillId,
        kind: "exercise",
        difficulty: hit.exercise.difficulty,
      });
  }
  return out;
}

export type LessonStatus = "locked" | "available" | "in_progress" | "complete";
export interface PathLesson {
  id: string;
  title: string;
  summary: string;
  skillId: string;
  status: LessonStatus;
  passed: number;
  total: number;
}
export interface PathUnit {
  id: string;
  title: string;
  lessons: PathLesson[];
}
export interface LearningPath {
  units: PathUnit[];
  skills: SkillState[];
  nextLessonId: string | null;
}

export function buildLearningPath(passedExerciseIds: Iterable<string>): LearningPath {
  const passed = new Set(passedExerciseIds);
  const tree = computeSkillTree(curriculum.skills, evidenceFromPassed(passed));
  let nextLessonId: string | null = null;
  const units = curriculum.units.map<PathUnit>((u) => ({
    id: u.id,
    title: u.title,
    lessons: u.lessonIds.map((lid) => {
      const l = lessonById.get(lid)!;
      const done = l.exercises.filter((e) => passed.has(e.id)).length;
      const unlocked = tree.get(l.skillId)?.unlocked ?? false;
      const status: LessonStatus = !unlocked
        ? "locked"
        : done === l.exercises.length
          ? "complete"
          : done > 0
            ? "in_progress"
            : "available";
      if (!nextLessonId && (status === "available" || status === "in_progress"))
        nextLessonId = l.id;
      return {
        id: l.id,
        title: l.title,
        summary: l.summary,
        skillId: l.skillId,
        status,
        passed: done,
        total: l.exercises.length,
      };
    }),
  }));
  return { units, skills: [...tree.values()], nextLessonId };
}

/** Server-side gate: may this user attempt this exercise yet? */
export function isExerciseUnlocked(
  exerciseId: string,
  passedExerciseIds: Iterable<string>,
): boolean {
  const hit = exerciseIndex.get(exerciseId);
  if (!hit) return false;
  const tree = computeSkillTree(curriculum.skills, evidenceFromPassed(passedExerciseIds));
  return tree.get(hit.lesson.skillId)?.unlocked ?? false;
}
