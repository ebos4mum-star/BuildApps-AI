"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  currentExerciseId,
  initDraft,
  isComplete,
  recordResult,
  sessionProgress,
  startSession,
  toAnswer,
  type ClientExercise,
  type Draft,
  type SessionState,
} from "@buildapps/lessons";
import type { AttemptOutcome, LessonPayload } from "@buildapps/api-client";
import { api, localTimeZone } from "@/lib/session";
import { Confetti } from "./Confetti";
import { ExerciseView } from "./ExerciseView";
import { Mascot } from "./Mascot";

interface Totals {
  xp: number;
  achievements: string[];
  levelUps: string[];
  streak: number;
}

export function LessonPlayer({ lesson }: { lesson: LessonPayload }) {
  const byId = new Map(lesson.exercises.map((e) => [e.id, e]));
  const [session, setSession] = useState<SessionState>(() =>
    startSession(lesson, lesson.passedExerciseIds),
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<AttemptOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals>({
    xp: 0,
    achievements: [],
    levelUps: [],
    streak: 0,
  });
  const [intro, setIntro] = useState(true);
  const [round, setRound] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const exId = currentExerciseId(session);
  const exercise: ClientExercise | undefined = exId ? byId.get(exId) : undefined;
  useEffect(() => {
    if (exercise) setDraft(initDraft(exercise));
  }, [exercise, round]);
  useEffect(() => {
    if (result) feedbackRef.current?.focus();
  }, [result]);

  async function check() {
    if (!exercise || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.submitAttempt(exercise.id, toAnswer(draft), localTimeZone());
      setResult(out);
      setTotals((t) => ({
        xp: t.xp + out.xpAwarded,
        achievements: [...t.achievements, ...out.newAchievements.map((a) => a.name)],
        levelUps: [...t.levelUps, ...out.skillLevelUps.map((s) => `${s.skillId} ${s.level}`)],
        streak: out.streak.current,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your answer");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (!exercise || !result) return;
    setSession((s) => recordResult(s, exercise.id, result.correct));
    setResult(null);
    setRound((r) => r + 1);
  }

  if (session.status === "complete") {
    return (
      <div className="done">
        <Confetti />
        <Mascot size={110} mood="cheer" />
        <h1>Lesson complete!</h1>
        <p className="muted">{lesson.title}</p>
        <div className="stats" style={{ justifyContent: "center" }}>
          <span className="stat">⚡ +{totals.xp} XP</span>
          {totals.streak > 0 && <span className="stat">🔥 {totals.streak}-day streak</span>}
          <span className="stat">✨ {session.firstTry.length} first-try</span>
        </div>
        {totals.levelUps.length > 0 && (
          <p>
            <span className="badge ok">Skill up</span> {totals.levelUps.join(", ")}
          </p>
        )}
        {totals.achievements.length > 0 && (
          <p>
            <span className="badge warn">Achievement</span> {totals.achievements.join(", ")}
          </p>
        )}
        <p role="status" className="sr-only">
          Lesson complete. You earned {totals.xp} XP.
        </p>
        <div className="stack" style={{ maxWidth: 320, margin: "1.5rem auto 0" }}>
          <Link href="/learn" className="btn">
            Continue
          </Link>
          <Link href="/projects" className="btn secondary">
            Back to my projects
          </Link>
        </div>
      </div>
    );
  }

  if (intro && session.passed.length === 0) {
    return (
      <div className="done">
        <Mascot size={90} />
        <h1>{lesson.title}</h1>
        <p className="muted" style={{ maxWidth: 480, margin: "0 auto 1.5rem" }}>
          {lesson.hook}
        </p>
        <button className="btn" onClick={() => setIntro(false)}>
          Let&apos;s go
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="stats" style={{ alignItems: "center", flexWrap: "nowrap" }}>
        <Link
          href="/learn"
          aria-label="Leave lesson"
          className="muted"
          style={{ textDecoration: "none", fontSize: "1.4rem" }}
        >
          ✕
        </Link>
        <div
          className="bar"
          style={{ flex: 1 }}
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sessionProgress(session, lesson.exercises.length) * 100)}
        >
          <i style={{ width: `${sessionProgress(session, lesson.exercises.length) * 100}%` }} />
        </div>
      </div>
      {exercise && draft && (
        <ExerciseView exercise={exercise} draft={draft} setDraft={setDraft} result={result} />
      )}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}

      {!result ? (
        <div className="footer-bar">
          <div className="in">
            <button
              className="btn"
              disabled={busy || !exercise || !draft || !isComplete(exercise, draft)}
              onClick={check}
            >
              {busy ? "Checking..." : "Check"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`sheet ${result.correct ? "ok" : "no"}`}
          ref={feedbackRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
        >
          <div className="in">
            <div className="msg">
              <h3>{result.correct ? "Nice work!" : "Not quite"}</h3>
              <div>{result.message}</div>
              <p className="muted" style={{ margin: ".4rem 0 0" }}>
                <strong>Why:</strong> {result.explanation}
              </p>
            </div>
            {result.xpAwarded > 0 && <span className="xp-pop">+{result.xpAwarded} XP</span>}
            <button className={`btn${result.correct ? "" : " danger"}`} onClick={next}>
              {result.correct ? "Continue" : "Got it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
