import { z } from "zod";
import type { Answer, ClientExercise, Exercise, GradeResult, Item } from "./types";

const ids = z.array(z.string().min(1).max(64)).max(64);
const record = z.record(z.string().max(64), z.string().max(64));
export const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sequence"), order: ids }),
  z.object({ type: z.literal("bug_hunt"), lineIds: ids }),
  z.object({ type: z.literal("match"), placements: record }),
  z.object({ type: z.literal("scenario"), optionId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("word_bank"), fills: record }),
]);

/** Deterministic grading. Throws if the answer shape does not match the exercise type. */
export function gradeExercise(ex: Exercise, raw: unknown): GradeResult {
  const a: Answer = answerSchema.parse(raw);
  if (a.type !== ex.type) throw new Error(`Answer type ${a.type} does not match ${ex.type}`);
  const done = (correct: boolean, message: string, wrongIds: string[] = []): GradeResult => ({
    correct,
    message,
    wrongIds,
    explanation: ex.explanation,
  });

  switch (ex.type) {
    case "sequence": {
      const a2 = a as Extract<Answer, { type: "sequence" }>;
      const valid =
        a2.order.length === ex.solution.length && new Set(a2.order).size === a2.order.length;
      const wrong = ex.solution.filter((id, i) => !valid || a2.order[i] !== id);
      return wrong.length === 0
        ? done(true, "Right order!")
        : done(
            false,
            `${ex.solution.length - wrong.length} of ${ex.solution.length} steps are in the right place.`,
            wrong,
          );
    }
    case "bug_hunt": {
      const a2 = a as Extract<Answer, { type: "bug_hunt" }>;
      const picked = new Set(a2.lineIds);
      const bugs = new Set(ex.solution);
      const missed = ex.solution.filter((id) => !picked.has(id));
      const extra = [...picked].filter((id) => !bugs.has(id));
      if (!missed.length && !extra.length) return done(true, "Bug found!");
      const msg = extra.length
        ? "One of those lines is actually fine - look again."
        : "There's still a bug you haven't spotted.";
      return done(false, msg, [...missed, ...extra]);
    }
    case "match": {
      const a2 = a as Extract<Answer, { type: "match" }>;
      const wrong = Object.keys(ex.solution).filter((id) => a2.placements[id] !== ex.solution[id]);
      return wrong.length === 0
        ? done(true, "Everything is in the right place!")
        : done(
            false,
            `${Object.keys(ex.solution).length - wrong.length} of ${Object.keys(ex.solution).length} placed correctly.`,
            wrong,
          );
    }
    case "scenario": {
      const a2 = a as Extract<Answer, { type: "scenario" }>;
      const chosen = ex.options.find((o) => o.id === a2.optionId);
      if (!chosen) throw new Error("Unknown option");
      return a2.optionId === ex.solution
        ? done(true, chosen.feedback)
        : done(false, chosen.feedback, [a2.optionId]);
    }
    case "word_bank": {
      const a2 = a as Extract<Answer, { type: "word_bank" }>;
      const wrong = Object.keys(ex.solution).filter((id) => a2.fills[id] !== ex.solution[id]);
      return wrong.length === 0
        ? done(true, "Perfect fit!")
        : done(false, "Some blanks need a different word.", wrong);
    }
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Seeded Fisher-Yates; guarantees the result differs from `solutionOrder` when possible. */
export function seededShuffle<T extends Item>(
  items: readonly T[],
  seed: string,
  solutionOrder?: readonly string[],
): T[] {
  const out = [...items];
  const r = rng(hash(seed));
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    if (!solutionOrder || out.length < 2 || out.some((it, i) => it.id !== solutionOrder[i])) break;
  }
  return out;
}

/** Strips solutions, explanations and per-option feedback before sending to a client. */
export function toClientExercise(ex: Exercise): ClientExercise {
  const common = {
    id: ex.id,
    prompt: ex.prompt,
    difficulty: ex.difficulty,
    ...(ex.context ? { context: ex.context } : {}),
  };
  switch (ex.type) {
    case "sequence":
      return { ...common, type: "sequence", items: seededShuffle(ex.items, ex.id, ex.solution) };
    case "bug_hunt":
      return {
        ...common,
        type: "bug_hunt",
        filename: ex.filename,
        lines: ex.lines,
        bugCount: ex.solution.length,
      };
    case "match":
      return {
        ...common,
        type: "match",
        categories: ex.categories,
        items: seededShuffle(ex.items, ex.id),
      };
    case "scenario":
      return {
        ...common,
        type: "scenario",
        options: seededShuffle(
          ex.options.map(({ id, label }) => ({ id, label })),
          ex.id,
        ),
      };
    case "word_bank":
      return {
        ...common,
        type: "word_bank",
        template: ex.template,
        words: seededShuffle(ex.words, ex.id),
      };
  }
}
