"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Dashboard } from "@/lib/api-types";
import { Mascot } from "@/components/Mascot";

const ICON = { complete: "★", available: "▶", in_progress: "▶", locked: "🔒" } as const;
const KIND_ICON = { lesson: "▶", debug_challenge: "🐞", guided_project: "🛠" } as const;
const KIND_LABEL = {
  lesson: "Lesson",
  debug_challenge: "Debugging case",
  guided_project: "Guided project",
} as const;

export default function Learn() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  useEffect(() => {
    api
      .dashboard()
      .then(setD)
      .catch((e) => setErr(e.message));
  }, []);
  if (err)
    return (
      <div className="err" role="alert">
        {err}
      </div>
    );
  if (!d)
    return (
      <p className="muted" role="status">
        Loading your path...
      </p>
    );
  const skillState = new Map(d.path.skills.map((s) => [s.skillId, s]));
  const activePath =
    d.path.paths.find((p) => p.id === pathId) ??
    d.path.paths.find((p) => p.current) ??
    d.path.paths[0]!;
  const shownUnits = d.path.units.filter((u) => activePath.unitIds.includes(u.id));
  return (
    <>
      <div className="stats" aria-label="Your stats">
        <span className="stat" title="Daily streak">
          🔥 {d.streak.displayed}
          <span className="sr-only"> day streak</span>
        </span>
        <span className="stat">⚡ {d.totalXp} XP</span>
        <span className="stat">🏅 Level {d.level}</span>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-label="XP to next level"
        aria-valuemin={0}
        aria-valuemax={d.xpForNextLevel}
        aria-valuenow={d.xpIntoLevel}
      >
        <i style={{ width: `${(d.xpIntoLevel / d.xpForNextLevel) * 100}%` }} />
      </div>
      <p className="muted" style={{ marginTop: ".3rem" }}>
        {d.xpForNextLevel - d.xpIntoLevel} XP to level {d.level + 1}
        {d.streak.status === "active" ? " - practise today to keep your streak" : ""}
      </p>

      {!d.profile && (
        <div className="card" data-testid="personalize-banner">
          <strong>Make this path yours</strong>
          <p className="muted" style={{ margin: ".3rem 0" }}>
            Answer a few questions and we will shape your path, daily goal and starting point.
          </p>
          <Link className="btn small" href="/onboarding">
            Personalize
          </Link>
        </div>
      )}
      {d.comeback && (
        <div className="card" role="status" data-testid="comeback">
          <strong>Welcome back! 👋</strong>
          <p className="muted" style={{ margin: ".3rem 0" }}>
            It has been {d.comeback.daysAway} days. Your progress is exactly where you left it. One
            short exercise is enough to get going again.
          </p>
          {d.path.nextLessonId && (
            <Link className="btn small" href={`/learn/${d.path.nextLessonId}`}>
              Pick up where you left off
            </Link>
          )}
        </div>
      )}
      {d.plan && (
        <div className="card" data-testid="plan">
          <strong>Your plan</strong>
          <p style={{ margin: ".3rem 0" }}>{d.plan.headline}</p>
          <div className="stats">
            {d.plan.projectFirst && (
              <Link className="btn small" href="/projects">
                Open my projects
              </Link>
            )}
            {d.plan.focusLessonId && (
              <Link className="btn small secondary" href={`/learn/${d.plan.focusLessonId}`}>
                Start with a lesson for your goals
              </Link>
            )}
            <Link className="btn small secondary" href="/onboarding?edit=1">
              Edit my plan
            </Link>
          </div>
          {d.plan.placementOffers.length > 0 && (
            <>
              <p className="muted" style={{ margin: ".6rem 0 .2rem" }}>
                Already know these? A short check lets you skip ahead. You still earn mastery by
                practising.
              </p>
              <div className="stats">
                {d.plan.placementOffers.map((id) => (
                  <Link key={id} className="badge" href={`/learn/check/${id}`}>
                    Skip check: {d.skillNames[id]}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {d.plan?.challengeLessonId && (
        <div className="card" data-testid="challenge">
          <strong>Today&apos;s challenge</strong>
          <p className="muted" style={{ margin: ".3rem 0" }}>
            Picked for your goals: put your skills to work on a real case.
          </p>
          <Link className="btn small" href={`/learn/${d.plan.challengeLessonId}`}>
            Take the challenge
          </Link>
        </div>
      )}
      <div className="card" data-testid="daily-goal">
        <strong>Today</strong>{" "}
        <span className="muted">
          {d.dailyGoal.met
            ? "Daily goal reached 🎉"
            : `${d.dailyGoal.todayXp} / ${d.dailyGoal.targetXp} XP`}
        </span>
        <div
          className="bar"
          style={{ marginTop: ".4rem" }}
          role="progressbar"
          aria-label="Daily goal"
          aria-valuemin={0}
          aria-valuemax={d.dailyGoal.targetXp}
          aria-valuenow={Math.min(d.dailyGoal.todayXp, d.dailyGoal.targetXp)}
        >
          <i
            style={{
              width: `${Math.min(100, (d.dailyGoal.todayXp / d.dailyGoal.targetXp) * 100)}%`,
            }}
          />
        </div>
        <div
          className="stats"
          style={{ marginTop: ".6rem", alignItems: "flex-end" }}
          aria-label={`This week: ${d.weekly.xp} XP over ${d.weekly.activeDays} active days`}
        >
          {d.weekly.days.map((w) => (
            <span key={w.day} title={`${w.day}: ${w.xp} XP`} aria-hidden="true">
              <i
                style={{
                  display: "block",
                  width: 14,
                  height: 6 + Math.min(40, w.xp / 2),
                  borderRadius: 4,
                  background: w.xp > 0 ? "var(--mint, #2ee6a6)" : "rgba(255,255,255,.15)",
                }}
              />
            </span>
          ))}
          <span className="muted">
            This week: {d.weekly.xp} XP · {d.weekly.activeDays} active{" "}
            {d.weekly.activeDays === 1 ? "day" : "days"}
          </span>
        </div>
      </div>

      {d.path.units.some((u) => u.lessons.some((l) => l.passed > 0)) && (
        <p>
          <Link className="btn secondary small" href="/learn/practice">
            Practice your weakest skills
          </Link>
        </p>
      )}
      <h2>Quests</h2>
      <div className="skills" aria-label="Daily and weekly quests">
        {d.quests.map((q) => (
          <div className="card" key={q.id}>
            <span className="badge">{q.period}</span> <strong>{q.name}</strong>
            <div className="muted">
              {q.description} {q.complete ? "Done - reward earned." : `+${q.rewardXp} XP`}
            </div>
            <div
              className="bar"
              style={{ marginTop: ".4rem" }}
              role="progressbar"
              aria-label={`${q.name} progress`}
              aria-valuemin={0}
              aria-valuemax={q.target}
              aria-valuenow={q.progress}
            >
              <i style={{ width: `${(q.progress / q.target) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <h2>Learning paths</h2>
      <div className="skills" role="tablist" aria-label="Learning paths">
        {d.path.paths.map((p) => {
          const pct = p.lessonsTotal ? (p.lessonsDone / p.lessonsTotal) * 100 : 0;
          const active = p.id === activePath.id;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={active}
              className="card path-card"
              style={{
                textAlign: "left",
                cursor: "pointer",
                outline: active ? "2px solid var(--brand, #6c5ce7)" : undefined,
              }}
              onClick={() => setPathId(p.id)}
            >
              <span className={`badge ${p.current ? "warn" : ""}`}>
                {p.current ? "You are here" : p.lessonsDone === p.lessonsTotal ? "Complete" : p.id}
              </span>{" "}
              <strong>{p.title}</strong>
              <div className="muted">{p.blurb}</div>
              <div
                className="bar"
                style={{ marginTop: ".4rem" }}
                role="progressbar"
                aria-label={`${p.title} progress`}
                aria-valuemin={0}
                aria-valuemax={p.lessonsTotal}
                aria-valuenow={p.lessonsDone}
              >
                <i style={{ width: `${pct}%` }} />
              </div>
              <small className="muted">
                {p.lessonsDone}/{p.lessonsTotal} lessons
              </small>
            </button>
          );
        })}
      </div>

      {shownUnits.map((u) => (
        <section key={u.id} aria-labelledby={u.id}>
          <div
            className={`unit${u.lessons.every((l) => l.status === "complete") ? " complete" : ""}`}
            id={u.id}
          >
            {u.title}
            <span className="unit-meta">
              {u.lessons.filter((l) => l.status === "complete").length}/{u.lessons.length}
              {u.lessons.every((l) => l.status === "complete") ? " ★ unit complete" : ""}
            </span>
          </div>
          <div className="path">
            {u.lessons.map((l, i) => {
              const current = l.id === d.path.nextLessonId;
              const cls = `node ${l.status === "complete" ? "complete" : l.status === "locked" ? "locked" : ""}${current ? " current" : ""}`;
              const style = { transform: `translateX(${[0, 46, 0, -46][i % 4]}px)` };
              const body = (
                <>
                  {l.status === "complete" ? ICON.complete : KIND_ICON[l.kind]}
                  <span className="sr-only"> {l.status.replace("_", " ")}</span>
                </>
              );
              return (
                <div
                  key={l.id}
                  className={`stop${l.status === "complete" ? " done" : ""}`}
                  style={{ textAlign: "center" }}
                >
                  {current && (
                    <span className="bolt-walker" aria-hidden="true">
                      <Mascot size={38} />
                    </span>
                  )}
                  {l.status === "locked" ? (
                    <span
                      className={cls}
                      style={style}
                      role="img"
                      aria-label={`${l.title} - locked`}
                      aria-disabled="true"
                    >
                      🔒
                    </span>
                  ) : (
                    <Link
                      href={`/learn/${l.id}`}
                      className={cls}
                      style={style}
                      aria-label={`${KIND_LABEL[l.kind]}: ${l.title} - ${l.passed} of ${l.total} done`}
                    >
                      {body}
                    </Link>
                  )}
                  <div className="node-label" style={{ margin: ".6rem auto 0" }}>
                    {l.title}
                    <small>
                      {l.status === "locked"
                        ? `Unlock by reaching Beginner in earlier skills`
                        : `${l.kind === "lesson" ? "" : KIND_LABEL[l.kind] + " · "}${l.passed}/${l.total} exercises`}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <h2>Your skills</h2>
      <div className="skills">
        {d.path.skills.map((s) => (
          <div className="card" key={s.skillId} style={{ opacity: s.unlocked ? 1 : 0.6 }}>
            <strong>{d.skillNames[s.skillId]}</strong>
            <div className="muted">
              {s.unlocked ? (s.level === "none" ? "Not started" : s.level) : "Locked"}
            </div>
            <div
              className="bar"
              style={{ marginTop: ".4rem" }}
              role="progressbar"
              aria-label={`${d.skillNames[s.skillId]} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.progressToNext * 100)}
            >
              <i style={{ width: `${s.progressToNext * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {skillState.size === 0 && null}

      <h2 style={{ marginTop: "1.5rem" }}>Achievements</h2>
      <div className="stats">
        {d.achievements.map((a) => (
          <span key={a.id} className={`badge ${a.earned ? "warn" : ""}`}>
            {a.earned ? "🏆 " : "🔒 "}
            {a.name}
          </span>
        ))}
      </div>
      <p style={{ textAlign: "center", marginTop: "2rem" }}>
        <Mascot size={48} />
      </p>
    </>
  );
}
