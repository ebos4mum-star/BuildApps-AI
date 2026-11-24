import type {
  BugHuntExercise,
  Difficulty,
  MatchExercise,
  ScenarioExercise,
  SequenceExercise,
  WordBankExercise,
} from "../types";

type Pair = [id: string, label: string];

/** Authoring helpers: items are written in solution order (clients receive them deterministically shuffled). */
export const seq = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  items: Pair[],
  explanation: string,
  context?: string,
): SequenceExercise => ({
  id,
  type: "sequence",
  difficulty,
  prompt,
  context,
  items: items.map(([i, label]) => ({ id: i, label })),
  solution: items.map(([i]) => i),
  explanation,
});

export const scn = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  context: string,
  options: [id: string, label: string, feedback: string][],
  solution: string,
  explanation: string,
): ScenarioExercise => ({
  id,
  type: "scenario",
  difficulty,
  prompt,
  context,
  options: options.map(([i, label, feedback]) => ({ id: i, label, feedback })),
  solution,
  explanation,
});

export const mat = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  categories: Pair[],
  items: [id: string, label: string, category: string][],
  explanation: string,
): MatchExercise => ({
  id,
  type: "match",
  difficulty,
  prompt,
  categories: categories.map(([i, label]) => ({ id: i, label })),
  items: items.map(([i, label]) => ({ id: i, label })),
  solution: Object.fromEntries(items.map(([i, , c]) => [i, c])),
  explanation,
});

export const wb = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  template: (string | { blank: string })[],
  words: Pair[],
  solution: Record<string, string>,
  explanation: string,
  context?: string,
): WordBankExercise => ({
  id,
  type: "word_bank",
  difficulty,
  prompt,
  context,
  template,
  words: words.map(([i, label]) => ({ id: i, label })),
  solution,
  explanation,
});

export const bug = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  filename: string,
  lines: string[],
  bugLines: number[],
  explanation: string,
): BugHuntExercise => ({
  id,
  type: "bug_hunt",
  difficulty,
  prompt,
  filename,
  lines: lines.map((label, i) => ({ id: `l${i + 1}`, label })),
  solution: bugLines.map((i) => `l${i + 1}`),
  explanation,
});
