import { describe, expect, it } from "vitest";
import {
  curriculum,
  gradeExercise,
  toClientExercise,
  initDraft,
  isComplete,
  toAnswer,
  moveItem,
  toggleLine,
  pickItem,
  placeItem,
  unplaceItem,
  chooseOption,
  fillBlank,
  tapWord,
  clearBlank,
  blanksOf,
  type Draft,
} from "./index";

const all = curriculum.lessons.flatMap((l) => l.exercises);
const first = <T extends string>(t: T) => all.find((e) => e.type === t)!;

describe("draft interactions", () => {
  it("sequence: reordering via moveItem can reach the solution and grades correct", () => {
    const ex = first("sequence");
    if (ex.type !== "sequence") throw new Error();
    let d = initDraft(toClientExercise(ex)) as Extract<Draft, { type: "sequence" }>;
    expect(isComplete(toClientExercise(ex), d)).toBe(true);
    ex.solution.forEach((id, i) => {
      d = moveItem(d, d.order.indexOf(id), i) as typeof d;
    });
    expect(gradeExercise(ex, toAnswer(d)).correct).toBe(true);
    expect(moveItem(d, 0, 99)).toBe(d);
  });
  it("bug hunt: single-bug selection acts like radio; toggling deselects", () => {
    let d = initDraft({ ...toClientExercise(first("bug_hunt")) }) as Extract<
      Draft,
      { type: "bug_hunt" }
    >;
    d = toggleLine(d, "l1", 1) as typeof d;
    d = toggleLine(d, "l2", 1) as typeof d;
    expect(d.selected).toEqual(["l2"]);
    expect((toggleLine(d, "l2", 1) as typeof d).selected).toEqual([]);
  });
  it("match: pick then place, unplace, completeness requires every item", () => {
    const ex = first("match");
    if (ex.type !== "match") throw new Error();
    const c = toClientExercise(ex);
    let d = initDraft(c) as Extract<Draft, { type: "match" }>;
    expect(isComplete(c, d)).toBe(false);
    d = pickItem(d, ex.items[0]!.id) as typeof d;
    expect(d.picked).toBe(ex.items[0]!.id);
    for (const it of ex.items) d = placeItem(d, it.id, ex.solution[it.id]!) as typeof d;
    expect(d.picked).toBeNull();
    expect(isComplete(c, d)).toBe(true);
    expect(gradeExercise(ex, toAnswer(d)).correct).toBe(true);
    expect(isComplete(c, unplaceItem(d, ex.items[0]!.id))).toBe(false);
  });
  it("scenario: needs a choice", () => {
    const ex = first("scenario");
    const c = toClientExercise(ex);
    let d = initDraft(c);
    expect(isComplete(c, d)).toBe(false);
    if (ex.type !== "scenario" || d.type !== "scenario") throw new Error();
    d = chooseOption(d, ex.solution);
    expect(isComplete(c, d)).toBe(true);
    expect(gradeExercise(ex, toAnswer(d)).correct).toBe(true);
  });
  it("word bank: tapping fills blanks in order, words move rather than duplicate", () => {
    const ex = first("word_bank");
    if (ex.type !== "word_bank") throw new Error();
    const c = toClientExercise(ex);
    if (c.type !== "word_bank") throw new Error();
    const blanks = blanksOf(c);
    let d = initDraft(c) as Extract<Draft, { type: "word_bank" }>;
    for (const b of blanks) d = tapWord(d, c, ex.solution[b]!) as typeof d;
    expect(isComplete(c, d)).toBe(true);
    expect(gradeExercise(ex, toAnswer(d)).correct).toBe(true);
    // moving a word to another blank frees its previous blank
    const moved = fillBlank(d, blanks[1]!, ex.solution[blanks[0]!]!) as typeof d;
    expect(moved.fills[blanks[0]!]).toBeUndefined();
    expect(Object.values(moved.fills).filter((w) => w === ex.solution[blanks[0]!])).toHaveLength(1);
    expect(clearBlank(d, blanks[0]!)).not.toBe(d);
    expect(tapWord(d, c, "x")).toBe(d); // all full: ignored
  });
});
