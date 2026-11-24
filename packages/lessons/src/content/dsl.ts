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

// ---- compact helpers (same output as the long forms above; ids are generated) ----
import type { Lesson, LessonKind } from "../types";

/** Scenario: the correct option is written first; clients receive options shuffled deterministically. */
export const sc = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  context: string,
  right: [label: string, feedback: string],
  wrongs: [label: string, feedback: string][],
  explanation: string,
): ScenarioExercise =>
  scn(
    id,
    difficulty,
    prompt,
    context,
    [
      ["a", ...right],
      ...wrongs.map(([l, f], i) => [String.fromCharCode(98 + i), l, f] as [string, string, string]),
    ],
    "a",
    explanation,
  );

/** Sequence: steps are written in the correct order. */
export const sq = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  steps: string[],
  explanation: string,
  context?: string,
): SequenceExercise =>
  seq(
    id,
    difficulty,
    prompt,
    steps.map((s, i) => [`s${i + 1}`, s] as Pair),
    explanation,
    context,
  );

/** Match: categories as [id,label] and items as { categoryId: [labels] }. */
export const mt = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  categories: Pair[],
  items: Record<string, string[]>,
  explanation: string,
): MatchExercise => {
  let n = 0;
  return mat(
    id,
    difficulty,
    prompt,
    categories,
    Object.entries(items).flatMap(([cat, labels]) =>
      labels.map((l) => [`i${++n}`, l, cat] as [string, string, string]),
    ),
    explanation,
  );
};

/** Word bank: template uses {{key}} for gaps; `answers` gives the right word per gap, `extra` adds distractors. */
export const wbk = (
  id: string,
  difficulty: Difficulty,
  prompt: string,
  template: string,
  answers: Record<string, string>,
  extra: string[],
  explanation: string,
  context?: string,
): WordBankExercise => {
  const parts = template.split(/\{\{(\w+)\}\}/g);
  const tpl = parts.map((p, i) => (i % 2 === 1 ? { blank: p } : p)).filter((p) => p !== "");
  const keys = Object.keys(answers);
  const words: Pair[] = [
    ...keys.map((k) => [`w_${k}`, answers[k]!] as Pair),
    ...extra.map((e, i) => [`x${i}`, e] as Pair),
  ];
  return wb(
    id,
    difficulty,
    prompt,
    tpl,
    words,
    Object.fromEntries(keys.map((k) => [k, `w_${k}`])),
    explanation,
    context,
  );
};

/** Lesson constructor with optional project-track metadata. */
export const lesson = (
  id: string,
  skillId: string,
  title: string,
  summary: string,
  hook: string,
  exercises: Lesson["exercises"],
  extra: { kind?: LessonKind; projectId?: string; projectTitle?: string } = {},
): Lesson => ({ id, skillId, title, summary, hook, exercises, ...extra });
