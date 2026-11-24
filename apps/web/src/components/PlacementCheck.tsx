"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { initDraft, toAnswer, type Answer, type Draft } from "@buildapps/lessons";
import type { PlacementCheck as Check } from "@buildapps/api-client";
import { api } from "@/lib/session";
import { ExerciseView } from "./ExerciseView";
import { Mascot } from "./Mascot";

type Outcome = { passed: boolean; results: { exerciseId: string; correct: boolean }[] };

/**
 * Skill check for experienced learners. No feedback is shown until the end, nothing is awarded for passing,
 * and passing only lets the learner skip ahead: mastery still has to be earned through real exercises.
 */
export function PlacementCheck({ check }: { check: Check }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);
  const ex = check.exercises[i];
  useEffect(() => {
    if (ex) setDraft(initDraft(ex));
  }, [ex]);

  async function next() {
    if (!ex || !draft) return;
    const all = { ...answers, [ex.id]: toAnswer(draft) };
    setAnswers(all);
    if (i < check.exercises.length - 1) return setI(i + 1);
    setBusy(true);
    setErr(null);
    try {
      setOut(await api.submitPlacement(check.skillId, all));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  if (out)
    return (
      <div className="done" role="status">
        <Mascot size={100} mood={out.passed ? "cheer" : undefined} />
        <h1>{out.passed ? "You can skip this one" : "Not quite yet"}</h1>
        <p className="muted">
          {out.passed
            ? `${check.skillName} is unlocked for what comes next. You earn XP and mastery by doing its lessons whenever you like.`
            : `You got ${out.results.filter((r) => r.correct).length} of ${out.results.length}. The lessons will cover the gaps, and you can try this check again later.`}
        </p>
        <div className="stack" style={{ maxWidth: 320, margin: "1rem auto" }}>
          <Link href="/learn" className="btn">
            Back to your path
          </Link>
        </div>
      </div>
    );
  if (!ex || !draft) return null;
  return (
    <div>
      <h1>Skill check: {check.skillName}</h1>
      <p className="muted">
        Question {i + 1} of {check.exercises.length}. No hints or feedback until the end, and
        passing earns no XP: it only lets you skip ahead.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <ExerciseView exercise={ex} draft={draft} setDraft={setDraft} result={null} />
      <div className="stack" style={{ maxWidth: 360, margin: "1.5rem auto 0" }}>
        <button className="btn" disabled={busy} onClick={next}>
          {i < check.exercises.length - 1 ? "Next" : busy ? "Checking..." : "Submit answers"}
        </button>
        <Link href="/learn" className="btn secondary">
          Leave the check
        </Link>
      </div>
    </div>
  );
}
