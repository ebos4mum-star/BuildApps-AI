import { curriculum } from "../../../packages/lessons/src/index";
import { writeFileSync } from "node:fs";
writeFileSync(
  process.argv[2]!,
  JSON.stringify(
    curriculum.lessons.map((l) => ({
      id: l.id,
      exercises: l.exercises.map((e: any) => ({
        id: e.id,
        prompt: e.prompt,
        type: e.type,
        solution: e.solution,
        items: e.items,
        lines: e.lines,
        categories: e.categories,
        options: e.options?.map((o: any) => ({ id: o.id, label: o.label })),
        words: e.words,
        template: e.template,
      })),
    })),
  ),
);
