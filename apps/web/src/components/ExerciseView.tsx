"use client";
import { useState } from "react";
import {
  blanksOf,
  chooseOption,
  clearBlank,
  fillBlank,
  moveItem,
  pickItem,
  placeItem,
  tapWord,
  toggleLine,
  unplaceItem,
  type ClientExercise,
  type Draft,
  type GradeResult,
} from "@buildapps/lessons";

interface Props {
  exercise: ClientExercise;
  draft: Draft;
  setDraft: (d: Draft) => void;
  /** Present after the answer was checked. */
  result: GradeResult | null;
}

/**
 * Renders one exercise. Every drag-and-drop interaction has a keyboard/tap equivalent
 * (move buttons, pick-then-place, tap-to-fill) so nothing depends on a pointing device.
 */
export function ExerciseView({ exercise, draft, setDraft, result }: Props) {
  const locked = result !== null;
  const wrongIds = new Set(result && !result.correct ? result.wrongIds : []);
  return (
    <div>
      <h2 className="ex-prompt">{exercise.prompt}</h2>
      {exercise.context && <div className="ex-context">{exercise.context}</div>}
      {exercise.type === "sequence" && draft.type === "sequence" && (
        <Sequence ex={exercise} d={draft} set={setDraft} locked={locked} wrongIds={wrongIds} />
      )}
      {exercise.type === "bug_hunt" && draft.type === "bug_hunt" && (
        <BugHunt
          ex={exercise}
          d={draft}
          set={setDraft}
          locked={locked}
          result={result}
          wrongIds={wrongIds}
        />
      )}
      {exercise.type === "match" && draft.type === "match" && (
        <Match ex={exercise} d={draft} set={setDraft} locked={locked} wrongIds={wrongIds} />
      )}
      {exercise.type === "scenario" && draft.type === "scenario" && (
        <Scenario ex={exercise} d={draft} set={setDraft} locked={locked} result={result} />
      )}
      {exercise.type === "word_bank" && draft.type === "word_bank" && (
        <WordBank ex={exercise} d={draft} set={setDraft} locked={locked} wrongIds={wrongIds} />
      )}
    </div>
  );
}

function Sequence({
  ex,
  d,
  set,
  locked,
  wrongIds,
}: {
  ex: Extract<ClientExercise, { type: "sequence" }>;
  d: Extract<Draft, { type: "sequence" }>;
  set: (d: Draft) => void;
  locked: boolean;
  wrongIds: Set<string>;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const label = (id: string) => ex.items.find((i) => i.id === id)?.label ?? id;
  return (
    <>
      <p className="muted" id="seq-help">
        Drag steps, or use the arrow buttons, to put them in order.
      </p>
      <ol
        className="stack"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
        aria-describedby="seq-help"
      >
        {d.order.map((id, i) => (
          <li
            key={id}
            className={`step${drag === i ? " dragging" : ""}${over === i ? " over" : ""}${locked ? (wrongIds.has(id) ? " wrong" : " right") : ""}`}
            draggable={!locked}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDrop={() => {
              if (drag !== null) set(moveItem(d, drag, i));
              setDrag(null);
              setOver(null);
            }}
          >
            <span className="grip" aria-hidden="true">
              ⠿
            </span>
            <span className="label">
              <span className="sr-only">Step {i + 1}: </span>
              {label(id)}
            </span>
            <button
              type="button"
              aria-label={`Move "${label(id)}" up`}
              disabled={locked || i === 0}
              onClick={() => set(moveItem(d, i, i - 1))}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label={`Move "${label(id)}" down`}
              disabled={locked || i === d.order.length - 1}
              onClick={() => set(moveItem(d, i, i + 1))}
            >
              ▼
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function BugHunt({
  ex,
  d,
  set,
  locked,
  result,
  wrongIds,
}: {
  ex: Extract<ClientExercise, { type: "bug_hunt" }>;
  d: Extract<Draft, { type: "bug_hunt" }>;
  set: (d: Draft) => void;
  locked: boolean;
  result: GradeResult | null;
  wrongIds: Set<string>;
}) {
  return (
    <>
      <p className="muted">
        Tap {ex.bugCount === 1 ? "the line with the bug" : `the ${ex.bugCount} buggy lines`}.
      </p>
      <div className="code" role="group" aria-label={`Code in ${ex.filename}`}>
        <div className="fn">{ex.filename}</div>
        {ex.lines.map((l, i) => {
          const sel = d.selected.includes(l.id);
          const cls = locked
            ? sel && result?.correct
              ? "right"
              : wrongIds.has(l.id)
                ? "wrong"
                : ""
            : "";
          return (
            <button
              key={l.id}
              type="button"
              className={cls}
              aria-pressed={sel}
              disabled={locked}
              onClick={() => set(toggleLine(d, l.id, ex.bugCount))}
            >
              <span className="ln" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="sr-only">Line {i + 1}: </span>
                {l.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Match({
  ex,
  d,
  set,
  locked,
  wrongIds,
}: {
  ex: Extract<ClientExercise, { type: "match" }>;
  d: Extract<Draft, { type: "match" }>;
  set: (d: Draft) => void;
  locked: boolean;
  wrongIds: Set<string>;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const unplaced = ex.items.filter((i) => !d.placements[i.id]);
  const chip = (id: string, text: string, placed: boolean, bucket?: string) => (
    <button
      key={id}
      type="button"
      className={`chip${locked && placed ? (wrongIds.has(id) ? " wrong" : " right") : ""}`}
      aria-pressed={d.picked === id}
      draggable={!locked}
      disabled={locked}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
      onClick={(e) => {
        e.stopPropagation();
        // holding a picked item and tapping a placed chip means "put it in this chip's box"
        if (placed && bucket && d.picked && d.picked !== id) set(placeItem(d, d.picked, bucket));
        else set(placed ? unplaceItem(d, id) : pickItem(d, id));
      }}
    >
      {text}
      {placed && !locked ? <span className="sr-only"> (placed, press to remove)</span> : null}
    </button>
  );
  return (
    <>
      <p className="muted">
        Drag each item into a box - or tap an item, then tap the box. Tap a placed item to take it
        back.
      </p>
      <div className="buckets">
        {ex.categories.map((c) => (
          <div
            key={c.id}
            className={`bucket${hot === c.id ? " hot" : ""}`}
            role="group"
            aria-label={c.label}
            onDragOver={(e) => {
              e.preventDefault();
              setHot(c.id);
            }}
            onDragLeave={() => setHot(null)}
            onDrop={(e) => {
              e.preventDefault();
              setHot(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id && !locked) set(placeItem(d, id, c.id));
            }}
            onClick={() => {
              if (d.picked && !locked) set(placeItem(d, d.picked, c.id));
            }}
          >
            <h4>{c.label}</h4>
            {ex.items
              .filter((i) => d.placements[i.id] === c.id)
              .map((i) => chip(i.id, i.label, true, c.id))}
          </div>
        ))}
      </div>
      <div className="pool" aria-label="Items to place">
        {unplaced.map((i) => chip(i.id, i.label, false))}
      </div>
    </>
  );
}

function Scenario({
  ex,
  d,
  set,
  locked,
  result,
}: {
  ex: Extract<ClientExercise, { type: "scenario" }>;
  d: Extract<Draft, { type: "scenario" }>;
  set: (d: Draft) => void;
  locked: boolean;
  result: GradeResult | null;
}) {
  return (
    <div className="stack" role="radiogroup" aria-label="Choose the best next move">
      {ex.options.map((o) => {
        const chosen = d.optionId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={locked}
            className={`choice${locked && chosen ? (result?.correct ? " right" : " wrong") : ""}`}
            onClick={() => set(chooseOption(d, o.id))}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function WordBank({
  ex,
  d,
  set,
  locked,
  wrongIds,
}: {
  ex: Extract<ClientExercise, { type: "word_bank" }>;
  d: Extract<Draft, { type: "word_bank" }>;
  set: (d: Draft) => void;
  locked: boolean;
  wrongIds: Set<string>;
}) {
  const word = (id: string) => ex.words.find((w) => w.id === id)?.label ?? "";
  const used = new Set(Object.values(d.fills));
  return (
    <>
      <p className="muted">
        Tap a word to fill the next blank. Tap a filled blank to remove it, or drag a word onto a
        blank.
      </p>
      <p className="sentence">
        {ex.template.map((t, i) =>
          typeof t === "string" ? (
            <span key={i}>{t}</span>
          ) : (
            <button
              key={i}
              type="button"
              className={`blank${d.fills[t.blank] ? " filled" : ""}${locked ? (wrongIds.has(t.blank) ? " wrong" : " right") : ""}`}
              aria-current={d.focusBlank === t.blank}
              aria-label={
                d.fills[t.blank]
                  ? `Blank ${t.blank}: ${word(d.fills[t.blank]!)} (press to remove)`
                  : `Empty blank ${t.blank}`
              }
              disabled={locked}
              onClick={() =>
                d.fills[t.blank] ? set(clearBlank(d, t.blank)) : set({ ...d, focusBlank: t.blank })
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const w = e.dataTransfer.getData("text/plain");
                if (w && !locked) set(fillBlank(d, t.blank, w));
              }}
            >
              {d.fills[t.blank] ? word(d.fills[t.blank]!) : " "}
            </button>
          ),
        )}
      </p>
      <div className="pool" aria-label="Word bank">
        {ex.words.map((w) => (
          <button
            key={w.id}
            type="button"
            className="chip"
            disabled={locked || used.has(w.id)}
            style={used.has(w.id) ? { opacity: 0.35 } : undefined}
            draggable={!locked}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", w.id)}
            onClick={() => set(tapWord(d, ex, w.id))}
          >
            {w.label}
          </button>
        ))}
      </div>
      {blanksOf(ex).length === 0 && null}
    </>
  );
}
