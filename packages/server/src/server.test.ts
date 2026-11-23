import { describe, expect, it } from "vitest";
import { curriculum } from "@buildapps/lessons";
import type { Answer, Exercise } from "@buildapps/lessons";
import {
  AttemptError,
  submitAttempt,
  createMemoryStores,
  createUserProject,
  reportMilestone,
  changeProjectState,
  ProjectError,
  advanceProjectRecovery,
  askForHumanHelp,
} from "./index";

const exercises = curriculum.lessons.flatMap((l) => l.exercises);
const ex = (id: string) => exercises.find((e) => e.id === id)!;
function right(e: Exercise): Answer {
  switch (e.type) {
    case "sequence":
      return { type: "sequence", order: e.solution };
    case "bug_hunt":
      return { type: "bug_hunt", lineIds: e.solution };
    case "match":
      return { type: "match", placements: e.solution };
    case "scenario":
      return { type: "scenario", optionId: e.solution };
    case "word_bank":
      return { type: "word_bank", fills: e.solution };
  }
}
const wrong = (e: Exercise): Answer =>
  e.type === "scenario"
    ? { type: "scenario", optionId: e.options.find((o) => o.id !== e.solution)!.id }
    : e.type === "sequence"
      ? { type: "sequence", order: [...e.solution].reverse() }
      : e.type === "bug_hunt"
        ? { type: "bug_hunt", lineIds: [] }
        : e.type === "match"
          ? { type: "match", placements: {} }
          : { type: "word_bank", fills: {} };

const U = "user-1";
const T0 = new Date("2026-02-01T10:00:00Z");
const submit = (
  stores: ReturnType<typeof createMemoryStores>,
  id: string,
  answer: unknown,
  now = T0,
  userId = U,
) => submitAttempt(stores.progress, { userId, exerciseId: id, answer, now, timeZone: "UTC" });

describe("submitAttempt", () => {
  it("awards XP with first-try bonus and starts a streak", async () => {
    const s = createMemoryStores();
    const r = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    expect(r.correct).toBe(true);
    expect(r.xpAwarded).toBeGreaterThanOrEqual(12); // difficulty 1: 10 + 2 bonus (+ achievement reward)
    expect(r.streak.current).toBe(1);
    expect(r.newAchievements.map((a) => a.id)).toContain("first-exercise");
    expect(r.explanation.length).toBeGreaterThan(40);
  });

  it("gives no bonus after a failed attempt and awards nothing for wrong answers", async () => {
    const s = createMemoryStores();
    const bad = await submit(s, "anatomy-1-match", wrong(ex("anatomy-1-match")));
    expect(bad).toMatchObject({ correct: false, xpAwarded: 0, totalXp: 0 });
    expect(bad.streak.current).toBe(0);
    const good = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    const first = await submit(
      createMemoryStores(),
      "anatomy-1-match",
      right(ex("anatomy-1-match")),
    );
    expect(good.xpAwarded).toBeLessThan(first.xpAwarded); // no first-try bonus
  });

  it("cannot farm XP by repeating a passed exercise", async () => {
    const s = createMemoryStores();
    const a = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    const b = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    const c = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    expect(b.xpAwarded).toBe(0);
    expect(c.xpAwarded).toBe(0);
    expect(b.alreadyCompleted).toBe(true);
    expect(c.totalXp).toBe(a.totalXp);
  });

  it("enforces prerequisites server-side", async () => {
    const s = createMemoryStores();
    await expect(submit(s, "ship-1-seq", right(ex("ship-1-seq")))).rejects.toMatchObject({
      code: "locked",
    });
    await expect(submit(s, "nope", {})).rejects.toBeInstanceOf(AttemptError);
    await expect(submit(s, "anatomy-1-match", { garbage: true })).rejects.toMatchObject({
      code: "invalid_answer",
    });
  });

  it("levels skills up, awards skill XP once and unlocks the next lesson", async () => {
    const s = createMemoryStores();
    const lesson = curriculum.lessons.find((l) => l.id === "anatomy-1")!;
    let levelUps: unknown[] = [];
    for (const e of lesson.exercises) levelUps = (await submit(s, e.id, right(e))).skillLevelUps;
    expect(levelUps).toEqual([{ skillId: "app-anatomy", level: "beginner" }]);
    expect(s.progress.users.get(U)!.awards.has("skill:app-anatomy:beginner")).toBe(true);
    await expect(submit(s, "collab-1-seq", right(ex("collab-1-seq")))).resolves.toMatchObject({
      correct: true,
    });
  });

  it("applies the daily exercise XP cap in the learner's local day", async () => {
    const s = createMemoryStores();
    s.progress.users.set(U, {
      totalXp: 0,
      streak: { current: 0, longest: 0, lastActiveDay: null, restDaysAvailable: 1 },
      version: 0,
      timeZone: "UTC",
      passed: new Set(),
      attempts: new Map(),
      achievements: new Set(["first-exercise"]),
      awards: new Map([
        ["exercise:farm", { xp: 300, source: "exercise", occurredAt: T0.toISOString() }],
      ]),
    });
    const r = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    expect(r.xpAwarded).toBe(0);
    expect(r.correct).toBe(true);
    // next day the cap resets
    const next = await submit(
      s,
      "anatomy-1-seq",
      right(ex("anatomy-1-seq")),
      new Date("2026-02-02T10:00:00Z"),
    );
    expect(next.xpAwarded).toBeGreaterThan(0);
  });

  it("retries on version conflict without double-awarding", async () => {
    const s = createMemoryStores();
    let injected = false;
    s.progress.beforeApply = () => {
      if (injected) return;
      injected = true;
      s.progress.users.get(U)!.version++; // a concurrent request committed first
    };
    const r = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    expect(r.correct).toBe(true);
    expect(
      [...s.progress.users.get(U)!.awards.keys()].filter((k) => k === "exercise:anatomy-1-match"),
    ).toHaveLength(1);
  });

  it("concurrent identical submissions award XP exactly once", async () => {
    const s = createMemoryStores();
    const e = ex("anatomy-1-match");
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => submit(s, e.id, right(e))),
    );
    const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    for (const r of settled)
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "busy" });
    const awardedExercise = [...s.progress.users.get(U)!.awards.keys()].filter((k) =>
      k.startsWith("exercise:"),
    );
    expect(awardedExercise).toEqual(["exercise:anatomy-1-match"]);
    expect(results.filter((r) => r.xpAwarded > 0)).toHaveLength(1);
  });

  it("streak continues across days and ignores invalid client timezones", async () => {
    const s = createMemoryStores();
    await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    const r = await submitAttempt(s.progress, {
      userId: U,
      exerciseId: "anatomy-1-seq",
      answer: right(ex("anatomy-1-seq")),
      now: new Date("2026-02-02T10:00:00Z"),
      timeZone: "Not/AZone",
    });
    expect(r.streak.current).toBe(2);
  });

  it("isolates users", async () => {
    const s = createMemoryStores();
    await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")), T0, "alice");
    const bob = await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")), T0, "bob");
    expect(bob.alreadyCompleted).toBe(false);
  });
});

describe("project service", () => {
  const intake = {
    journey: "rescue",
    name: "Stuck",
    repoUrl: "https://github.com/octo/stuck",
    problem: "Build breaks after every AI edit",
  } as const;

  it("creates, lists and isolates projects by owner", async () => {
    const { projects } = createMemoryStores();
    const p = await createUserProject(projects, "alice", intake);
    expect((await projects.list("alice")).map((x) => x.id)).toEqual([p.id]);
    expect(await projects.list("bob")).toEqual([]);
    await expect(reportMilestone(projects, "bob", p.id, "assess")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("clients can self-report but never verify, and cannot force in_verification", async () => {
    const { projects } = createMemoryStores();
    const p = await createUserProject(projects, "alice", intake);
    await changeProjectState(projects, "alice", p.id, "active");
    const r = await reportMilestone(projects, "alice", p.id, "assess");
    expect(r.milestones.find((m) => m.id === "assess")?.completion?.source).toBe("user_reported");
    await expect(
      changeProjectState(projects, "alice", p.id, "in_verification"),
    ).rejects.toMatchObject({ code: "forbidden_transition" });
    await expect(changeProjectState(projects, "alice", p.id, "completed")).rejects.toBeInstanceOf(
      ProjectError,
    );
  });

  it("supports rescue recovery and human-help requests, rejects bad intake", async () => {
    const { projects } = createMemoryStores();
    const p = await createUserProject(projects, "alice", intake);
    expect((await advanceProjectRecovery(projects, "alice", p.id)).recovery?.stage).toBe("triage");
    expect((await askForHumanHelp(projects, "alice", p.id)).recovery?.humanHelpRequested).toBe(
      true,
    );
    await expect(
      createUserProject(projects, "alice", { ...intake, repoUrl: "https://evil.example/x/y" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("dashboard & lesson delivery", () => {
  it("serves solution-free lessons only when unlocked, and reflects progress", async () => {
    const { getDashboard, getLessonForUser } = await import("./index");
    const s = createMemoryStores();
    expect(await getLessonForUser(s.progress, U, "ship-1")).toBeNull();
    expect(await getLessonForUser(s.progress, U, "nope")).toBeNull();
    const lesson = await getLessonForUser(s.progress, U, "anatomy-1");
    expect(JSON.stringify(lesson)).not.toMatch(/"solution"|"explanation"|"feedback"/);
    await submit(s, "anatomy-1-match", right(ex("anatomy-1-match")));
    const d = await getDashboard(s.progress, U, T0);
    expect(d.totalXp).toBeGreaterThan(0);
    expect(d.streak).toMatchObject({ displayed: 1, status: "completed_today" });
    expect(d.achievements.find((a) => a.id === "first-exercise")?.earned).toBe(true);
    expect(d.path.nextLessonId).toBe("anatomy-1");
  });
});
