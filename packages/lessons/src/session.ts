import type { Lesson } from "./types";

/**
 * Pure lesson-player state, shared by web and mobile. Wrong answers are never punished with lost
 * lives: the exercise simply returns later in the lesson so the learner practises it again.
 * This state is for UX only; the server remains the authority on what was passed and what XP is earned.
 */
export interface SessionState {
  lessonId: string;
  queue: string[];
  passed: string[];
  attempts: Record<string, number>;
  /** Exercises answered correctly on the first try (for celebration only). */
  firstTry: string[];
  status: "answering" | "complete";
}

export function startSession(lesson: Lesson, alreadyPassed: readonly string[] = []): SessionState {
  const done = new Set(alreadyPassed);
  const queue = lesson.exercises.map((e) => e.id).filter((id) => !done.has(id));
  return {
    lessonId: lesson.id,
    queue,
    passed: lesson.exercises.map((e) => e.id).filter((id) => done.has(id)),
    attempts: {},
    firstTry: [],
    status: queue.length === 0 ? "complete" : "answering",
  };
}

export const currentExerciseId = (s: SessionState): string | null => s.queue[0] ?? null;

export function recordResult(s: SessionState, exerciseId: string, correct: boolean): SessionState {
  if (s.status === "complete" || s.queue[0] !== exerciseId) return s;
  const attempts = { ...s.attempts, [exerciseId]: (s.attempts[exerciseId] ?? 0) + 1 };
  const rest = s.queue.slice(1);
  if (correct) {
    const firstTry = attempts[exerciseId] === 1 ? [...s.firstTry, exerciseId] : s.firstTry;
    return {
      ...s,
      attempts,
      firstTry,
      passed: [...s.passed, exerciseId],
      queue: rest,
      status: rest.length ? "answering" : "complete",
    };
  }
  return { ...s, attempts, queue: [...rest, exerciseId] }; // try again later
}

export const sessionProgress = (s: SessionState, total: number): number =>
  total === 0 ? 1 : s.passed.length / total;
