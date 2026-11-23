import type { SkillDefinition } from "@buildapps/core";

export type Difficulty = 1 | 2 | 3;
export interface Item {
  id: string;
  label: string;
}

interface BaseExercise {
  id: string;
  prompt: string;
  /** Optional realistic situation, e.g. what an AI tool just produced. */
  context?: string;
  difficulty: Difficulty;
  /** Teaches WHY the answer works; only revealed after grading. */
  explanation: string;
}

/** Drag steps into the right order. */
export interface SequenceExercise extends BaseExercise {
  type: "sequence";
  items: Item[];
  solution: string[];
}
/** Tap the line(s) that contain the bug. */
export interface BugHuntExercise extends BaseExercise {
  type: "bug_hunt";
  filename: string;
  lines: Item[];
  solution: string[];
}
/** Drag each item into the right bucket (frontend / backend / database ...). */
export interface MatchExercise extends BaseExercise {
  type: "match";
  categories: Item[];
  items: Item[];
  solution: Record<string, string>;
}
/** Realistic AI-project situation: choose the best next move. Each option teaches something. */
export interface ScenarioExercise extends BaseExercise {
  type: "scenario";
  options: (Item & { feedback: string })[];
  solution: string;
}
/** Complete a spec/prompt/command from a word bank. */
export interface WordBankExercise extends BaseExercise {
  type: "word_bank";
  /** Strings are text; `{ blank: id }` is a gap to fill. */
  template: (string | { blank: string })[];
  words: Item[];
  solution: Record<string, string>;
}
export type Exercise =
  SequenceExercise | BugHuntExercise | MatchExercise | ScenarioExercise | WordBankExercise;
export type ExerciseType = Exercise["type"];

export interface Lesson {
  id: string;
  skillId: string;
  title: string;
  summary: string;
  /** Short real-world hook shown before the first exercise. */
  hook: string;
  exercises: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  lessonIds: string[];
}

export interface Curriculum {
  skills: SkillDefinition[];
  lessons: Lesson[];
  units: Unit[];
}

/** What a client may see: no solutions, no explanations, items deterministically shuffled. */
export type ClientExercise =
  | Omit<SequenceExercise, "solution" | "explanation">
  | (Omit<BugHuntExercise, "solution" | "explanation"> & { bugCount: number })
  | Omit<MatchExercise, "solution" | "explanation">
  | (Omit<ScenarioExercise, "solution" | "explanation" | "options"> & { options: Item[] })
  | Omit<WordBankExercise, "solution" | "explanation">;

export type Answer =
  | { type: "sequence"; order: string[] }
  | { type: "bug_hunt"; lineIds: string[] }
  | { type: "match"; placements: Record<string, string> }
  | { type: "scenario"; optionId: string }
  | { type: "word_bank"; fills: Record<string, string> };

export interface GradeResult {
  correct: boolean;
  explanation: string;
  /** Short, specific feedback shown immediately. */
  message: string;
  /** Ids of items the learner got wrong (positions, lines, items or blanks). */
  wrongIds: string[];
}
