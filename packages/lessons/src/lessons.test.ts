import { describe, expect, it } from "vitest";
import {
  curriculum,
  gradeExercise,
  toClientExercise,
  validateCurriculum,
  buildLearningPath,
  projectCount,
  debugChallengeCount,
  evidenceFromPassed,
  isExerciseUnlocked,
  startSession,
  recordResult,
  currentExerciseId,
  type Answer,
  type Exercise,
} from "./index";
import { computeSkillTree } from "@buildapps/core";

const all = curriculum.lessons.flatMap((l) => l.exercises);

function correctAnswer(ex: Exercise): Answer {
  switch (ex.type) {
    case "sequence":
      return { type: "sequence", order: ex.solution };
    case "bug_hunt":
      return { type: "bug_hunt", lineIds: ex.solution };
    case "match":
      return { type: "match", placements: ex.solution };
    case "scenario":
      return { type: "scenario", optionId: ex.solution };
    case "word_bank":
      return { type: "word_bank", fills: ex.solution };
  }
}
function wrongAnswer(ex: Exercise): Answer {
  switch (ex.type) {
    case "sequence":
      return { type: "sequence", order: [...ex.solution].reverse() };
    case "bug_hunt":
      return { type: "bug_hunt", lineIds: [] };
    case "match":
      return { type: "match", placements: {} };
    case "scenario":
      return { type: "scenario", optionId: ex.options.find((o) => o.id !== ex.solution)!.id };
    case "word_bank":
      return { type: "word_bank", fills: {} };
  }
}

describe("curriculum content", () => {
  it("passes authoring validation", () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
  it("has variety: every exercise type is used and no lesson is quiz-only", () => {
    expect(new Set(all.map((e) => e.type))).toEqual(
      new Set(["sequence", "bug_hunt", "match", "scenario", "word_bank"]),
    );
    expect(all.length).toBeGreaterThanOrEqual(30);
  });
  it("every exercise's solution grades correct and a wrong answer grades incorrect", () => {
    for (const ex of all) {
      expect(gradeExercise(ex, correctAnswer(ex)).correct, ex.id).toBe(true);
      expect(gradeExercise(ex, wrongAnswer(ex)).correct, ex.id).toBe(false);
    }
  });
  it("every skill can be taken to beginner by completing its lessons in order", () => {
    const passed = all.map((e) => e.id);
    const tree = computeSkillTree(curriculum.skills, evidenceFromPassed(passed));
    for (const s of curriculum.skills) expect(tree.get(s.id)?.level, s.id).not.toBe("none");
  });
});

describe("client projection", () => {
  it("never leaks solutions, explanations or option feedback", () => {
    const json = JSON.stringify(all.map(toClientExercise));
    for (const k of ['"solution"', '"explanation"', '"feedback"']) expect(json).not.toContain(k);
  });
  it("shuffles deterministically and never presents sequences already solved", () => {
    for (const ex of all) {
      const a = JSON.stringify(toClientExercise(ex));
      expect(a).toBe(JSON.stringify(toClientExercise(ex)));
      if (ex.type === "sequence") {
        const c = toClientExercise(ex);
        if (c.type === "sequence") expect(c.items.map((i) => i.id)).not.toEqual(ex.solution);
      }
    }
  });
});

describe("grader", () => {
  const seq = all.find((e) => e.type === "sequence")!;
  it("rejects mismatched or malformed answers", () => {
    expect(() => gradeExercise(seq, { type: "scenario", optionId: "x" })).toThrow();
    expect(() => gradeExercise(seq, { nope: 1 })).toThrow();
    expect(() => gradeExercise(seq, null)).toThrow();
  });
  it("treats duplicate or partial sequence answers as wrong", () => {
    if (seq.type !== "sequence") throw new Error();
    expect(
      gradeExercise(seq, {
        type: "sequence",
        order: [seq.solution[0]!, seq.solution[0]!, seq.solution[0]!],
      }).correct,
    ).toBe(false);
    expect(gradeExercise(seq, { type: "sequence", order: seq.solution.slice(1) }).correct).toBe(
      false,
    );
  });
  it("bug hunt rejects over-selecting every line", () => {
    const bug = all.find((e) => e.type === "bug_hunt")!;
    if (bug.type !== "bug_hunt") throw new Error();
    const r = gradeExercise(bug, { type: "bug_hunt", lineIds: bug.lines.map((l) => l.id) });
    expect(r.correct).toBe(false);
    expect(r.explanation.length).toBeGreaterThan(40);
  });
  it("scenario feedback explains the chosen option and unknown options throw", () => {
    const sc = all.find((e) => e.type === "scenario")!;
    if (sc.type !== "scenario") throw new Error();
    const wrong = sc.options.find((o) => o.id !== sc.solution)!;
    expect(gradeExercise(sc, { type: "scenario", optionId: wrong.id }).message).toBe(
      wrong.feedback,
    );
    expect(() => gradeExercise(sc, { type: "scenario", optionId: "zzz" })).toThrow();
  });
});

describe("learning path", () => {
  it("starts with only the foundation skill unlocked", () => {
    const p = buildLearningPath([]);
    expect(p.nextLessonId).toBe("anatomy-1");
    const flat = p.units.flatMap((u) => u.lessons);
    expect(flat.find((l) => l.id === "anatomy-1")?.status).toBe("available");
    expect(flat.find((l) => l.id === "ship-1")?.status).toBe("locked");
  });
  it("unlocks dependent skills after beginner evidence and gates exercises server-side", () => {
    expect(isExerciseUnlocked("collab-1-seq", [])).toBe(false);
    const passed = curriculum.lessons.find((l) => l.id === "anatomy-1")!.exercises.map((e) => e.id);
    expect(isExerciseUnlocked("collab-1-seq", passed)).toBe(true);
    expect(isExerciseUnlocked("does-not-exist", passed)).toBe(false);
    const p = buildLearningPath(passed);
    expect(p.units[0]!.lessons[0]!.status).toBe("complete");
    expect(p.nextLessonId).toBe("anatomy-2");
  });
});

describe("lesson session", () => {
  const lesson = curriculum.lessons[0]!;
  it("requeues wrong answers instead of punishing, then completes", () => {
    let s = startSession(lesson);
    const first = currentExerciseId(s)!;
    s = recordResult(s, first, false);
    expect(s.queue.at(-1)).toBe(first);
    expect(s.status).toBe("answering");
    while (s.status === "answering") s = recordResult(s, currentExerciseId(s)!, true);
    expect(s.passed).toHaveLength(lesson.exercises.length);
    expect(s.firstTry).not.toContain(first);
  });
  it("ignores results for non-current exercises and resumes past progress", () => {
    const s = startSession(lesson, [lesson.exercises[0]!.id]);
    expect(s.queue).toHaveLength(lesson.exercises.length - 1);
    expect(recordResult(s, "bogus", true)).toBe(s);
    expect(
      startSession(
        lesson,
        lesson.exercises.map((e) => e.id),
      ).status,
    ).toBe("complete");
  });
});

describe("content targets", () => {
  it("meets the established curriculum targets", () => {
    expect(curriculum.lessons.length).toBeGreaterThanOrEqual(150);
    expect(all.length).toBeGreaterThanOrEqual(750);
    expect(projectCount()).toBeGreaterThanOrEqual(15);
    expect(debugChallengeCount()).toBeGreaterThanOrEqual(30);
  });
  it("covers the required application types with guided projects", () => {
    const titles = curriculum.lessons
      .filter((l) => l.projectTitle)
      .map((l) => l.projectTitle!.toLowerCase());
    for (const topic of [
      "store",
      "social",
      "fitness",
      "business",
      "booking",
      "marketplace",
      "ai",
      "mobile",
    ])
      expect(
        titles.some((t) => t.includes(topic)),
        topic,
      ).toBe(true);
  });
  it("has no copy-pasted filler: every prompt is unique", () => {
    const prompts = all.map((e) => e.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});
