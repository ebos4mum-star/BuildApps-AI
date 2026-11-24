import type { Curriculum, Exercise, Lesson } from "./types";
import { validateSkillGraph } from "@buildapps/core";

/** Authoring-time checks: returns a list of problems (empty = valid). */
export function validateExercise(ex: Exercise): string[] {
  const p: string[] = [];
  const unique = (ids: string[], what: string) => {
    if (new Set(ids).size !== ids.length) p.push(`${ex.id}: duplicate ${what} ids`);
  };
  if (!ex.explanation || ex.explanation.length < 40)
    p.push(`${ex.id}: explanation too short to teach`);
  switch (ex.type) {
    case "sequence":
      unique(
        ex.items.map((i) => i.id),
        "item",
      );
      if (ex.items.length < 3) p.push(`${ex.id}: sequence needs >= 3 items`);
      if (
        ex.solution.length !== ex.items.length ||
        ex.solution.some((s) => !ex.items.some((i) => i.id === s))
      )
        p.push(`${ex.id}: solution must be a permutation of items`);
      break;
    case "bug_hunt":
      unique(
        ex.lines.map((i) => i.id),
        "line",
      );
      if (!ex.solution.length || ex.solution.some((s) => !ex.lines.some((i) => i.id === s)))
        p.push(`${ex.id}: bug lines must exist`);
      break;
    case "match":
      unique(
        ex.items.map((i) => i.id),
        "item",
      );
      for (const i of ex.items)
        if (!ex.categories.some((c) => c.id === ex.solution[i.id]))
          p.push(`${ex.id}: item ${i.id} has no valid category`);
      if (new Set(Object.values(ex.solution)).size < 2)
        p.push(`${ex.id}: match should use >= 2 categories`);
      break;
    case "scenario": {
      unique(
        ex.options.map((i) => i.id),
        "option",
      );
      if (ex.options.length < 3) p.push(`${ex.id}: scenario needs >= 3 options`);
      if (!ex.options.some((o) => o.id === ex.solution))
        p.push(`${ex.id}: solution option missing`);
      if (ex.options.some((o) => o.feedback.length < 20))
        p.push(`${ex.id}: every option needs real feedback`);
      break;
    }
    case "word_bank": {
      const blanks = ex.template.flatMap((t) => (typeof t === "string" ? [] : [t.blank]));
      unique(blanks, "blank");
      for (const b of blanks)
        if (!ex.words.some((w) => w.id === ex.solution[b]))
          p.push(`${ex.id}: blank ${b} unsolvable`);
      if (ex.words.length <= blanks.length) p.push(`${ex.id}: word bank needs distractors`);
      if (new Set(ex.words.map((w) => w.label)).size !== ex.words.length)
        p.push(`${ex.id}: word bank labels must be unique`);
      break;
    }
  }
  return p;
}

export function validateLesson(l: Lesson): string[] {
  const p = l.exercises.flatMap(validateExercise);
  if (l.exercises.length < 3 || l.exercises.length > 8)
    p.push(`${l.id}: lessons should be 3-8 exercises`);
  if (new Set(l.exercises.map((e) => e.id)).size !== l.exercises.length)
    p.push(`${l.id}: duplicate exercise ids`);
  if (new Set(l.exercises.map((e) => e.type)).size < 2) p.push(`${l.id}: mix exercise types`);
  return p;
}

export function validateCurriculum(c: Curriculum): string[] {
  const p: string[] = [];
  try {
    validateSkillGraph(c.skills);
  } catch (e) {
    p.push((e as Error).message);
  }
  const lessonIds = new Set(c.lessons.map((l) => l.id));
  if (lessonIds.size !== c.lessons.length) p.push("duplicate lesson ids");
  const exIds = c.lessons.flatMap((l) => l.exercises.map((e) => e.id));
  if (new Set(exIds).size !== exIds.length) p.push("exercise ids must be globally unique");
  for (const l of c.lessons) {
    if (!c.skills.some((s) => s.id === l.skillId)) p.push(`${l.id}: unknown skill ${l.skillId}`);
    p.push(...validateLesson(l));
  }
  const inUnits = c.units.flatMap((u) => u.lessonIds);
  for (const id of inUnits) if (!lessonIds.has(id)) p.push(`unit references unknown lesson ${id}`);
  for (const id of lessonIds) if (!inUnits.includes(id)) p.push(`lesson ${id} is in no unit`);
  const unitIds = new Set(c.units.map((u) => u.id));
  const pathed = c.paths.flatMap((x) => x.unitIds);
  for (const id of pathed) if (!unitIds.has(id)) p.push(`path references unknown unit ${id}`);
  for (const id of unitIds)
    if (pathed.filter((x) => x === id).length !== 1)
      p.push(`unit ${id} must be in exactly one path`);
  for (const l of c.lessons) {
    if (l.kind === "debug_challenge" && !l.exercises.some((e) => e.type === "bug_hunt"))
      p.push(`${l.id}: a debug challenge needs a bug_hunt`);
    if (l.projectId && (l.kind ?? "lesson") !== "guided_project")
      p.push(`${l.id}: only guided projects carry a projectId`);
    if (l.kind === "guided_project" && l.exercises.length < 5)
      p.push(`${l.id}: a guided project needs at least 5 steps`);
  }
  return p;
}
