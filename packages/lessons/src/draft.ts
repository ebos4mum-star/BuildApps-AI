import type { Answer, ClientExercise } from "./types";

/**
 * Pure interaction state for each exercise type. Both the web and mobile UIs render from this, so
 * drag/drop, tap and keyboard interactions behave identically and are unit-tested once.
 */
export type Draft =
  | { type: "sequence"; order: string[] }
  | { type: "bug_hunt"; selected: string[] }
  | { type: "match"; placements: Record<string, string>; picked: string | null }
  | { type: "scenario"; optionId: string | null }
  | { type: "word_bank"; fills: Record<string, string>; focusBlank: string | null };

export function initDraft(ex: ClientExercise): Draft {
  switch (ex.type) {
    case "sequence":
      return { type: "sequence", order: ex.items.map((i) => i.id) };
    case "bug_hunt":
      return { type: "bug_hunt", selected: [] };
    case "match":
      return { type: "match", placements: {}, picked: null };
    case "scenario":
      return { type: "scenario", optionId: null };
    case "word_bank":
      return { type: "word_bank", fills: {}, focusBlank: null };
  }
}

export const blanksOf = (ex: Extract<ClientExercise, { type: "word_bank" }>): string[] =>
  ex.template.flatMap((t) => (typeof t === "string" ? [] : [t.blank]));

export function moveItem(d: Extract<Draft, { type: "sequence" }>, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= d.order.length || to >= d.order.length) return d;
  const order = [...d.order];
  const [it] = order.splice(from, 1);
  order.splice(to, 0, it!);
  return { ...d, order };
}

export function toggleLine(
  d: Extract<Draft, { type: "bug_hunt" }>,
  lineId: string,
  max: number,
): Draft {
  if (d.selected.includes(lineId))
    return { ...d, selected: d.selected.filter((x) => x !== lineId) };
  // single-bug exercises behave like radio buttons; multi-bug ones cap at the bug count
  const selected = max === 1 ? [lineId] : [...d.selected, lineId].slice(-max);
  return { ...d, selected };
}

export function pickItem(d: Extract<Draft, { type: "match" }>, itemId: string | null): Draft {
  return { ...d, picked: d.picked === itemId ? null : itemId };
}
export function placeItem(
  d: Extract<Draft, { type: "match" }>,
  itemId: string,
  categoryId: string,
): Draft {
  return { ...d, placements: { ...d.placements, [itemId]: categoryId }, picked: null };
}
export function unplaceItem(d: Extract<Draft, { type: "match" }>, itemId: string): Draft {
  const { [itemId]: _gone, ...rest } = d.placements;
  return { ...d, placements: rest };
}

export function chooseOption(d: Extract<Draft, { type: "scenario" }>, optionId: string): Draft {
  return { ...d, optionId };
}

/** Puts a word in a blank; a word can only be used once, so it moves if already placed elsewhere. */
export function fillBlank(
  d: Extract<Draft, { type: "word_bank" }>,
  blankId: string,
  wordId: string,
): Draft {
  const fills = Object.fromEntries(Object.entries(d.fills).filter(([, w]) => w !== wordId));
  fills[blankId] = wordId;
  return { ...d, fills, focusBlank: null };
}
export function clearBlank(d: Extract<Draft, { type: "word_bank" }>, blankId: string): Draft {
  const { [blankId]: _gone, ...fills } = d.fills;
  return { ...d, fills };
}
/** Tap a word: fill the focused blank, else the first empty one. */
export function tapWord(
  d: Extract<Draft, { type: "word_bank" }>,
  ex: Extract<ClientExercise, { type: "word_bank" }>,
  wordId: string,
): Draft {
  const blanks = blanksOf(ex);
  const target = d.focusBlank ?? blanks.find((b) => !d.fills[b]);
  return target ? fillBlank(d, target, wordId) : d;
}

export function isComplete(ex: ClientExercise, d: Draft): boolean {
  switch (ex.type) {
    case "sequence":
      return d.type === "sequence" && d.order.length === ex.items.length;
    case "bug_hunt":
      return d.type === "bug_hunt" && d.selected.length > 0;
    case "match":
      return d.type === "match" && ex.items.every((i) => d.placements[i.id]);
    case "scenario":
      return d.type === "scenario" && d.optionId !== null;
    case "word_bank":
      return d.type === "word_bank" && blanksOf(ex).every((b) => d.fills[b]);
  }
}

export function toAnswer(d: Draft): Answer {
  switch (d.type) {
    case "sequence":
      return { type: "sequence", order: d.order };
    case "bug_hunt":
      return { type: "bug_hunt", lineIds: d.selected };
    case "match":
      return { type: "match", placements: d.placements };
    case "scenario":
      return { type: "scenario", optionId: d.optionId ?? "" };
    case "word_bank":
      return { type: "word_bank", fills: d.fills };
  }
}
