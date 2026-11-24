import { describe, expect, it } from "vitest";
import { curriculum, findExercise, placementExerciseIds } from "@buildapps/lessons";
import { GOAL_FOCUS_SKILLS, PLACEMENT_CANDIDATES } from "@buildapps/core";
import {
  createMemoryStores,
  getDashboard,
  getLessonForUser,
  getMyProfile,
  getPlacement,
  saveMyProfile,
  submitAttempt,
  submitPlacement,
  WorkspaceError,
  type Deps,
} from "./index";

const profile = {
  experience: "experienced",
  goals: ["level_up_skills"],
  tools: ["claude_code", "cursor"],
  intent: "learn_first",
  pace: "steady",
  projectTypes: ["web_app"],
  platforms: ["web"],
  reminders: { enabled: false, hour: 18 },
};
function setup() {
  const stores = createMemoryStores();
  const deps: Deps = {
    stores,
    gateway: null,
    stateSecret: "x".repeat(32),
    now: () => new Date("2026-03-10T12:00:00Z"),
  };
  return { stores, deps };
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof WorkspaceError ? e.code : "other"),
  );
function correct(id: string): unknown {
  const ex = findExercise(id)!.exercise;
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

describe("curriculum references used for personalization", () => {
  it("every focus and placement skill exists and has a skill check", () => {
    const skills = new Set(curriculum.skills.map((s) => s.id));
    for (const ids of Object.values(GOAL_FOCUS_SKILLS))
      for (const id of ids) expect(skills.has(id), id).toBe(true);
    for (const id of PLACEMENT_CANDIDATES) {
      expect(skills.has(id), id).toBe(true);
      expect(placementExerciseIds(id).length, id).toBe(4);
    }
  });
});

describe("profile", () => {
  it("validates and persists answers, and edits keep placement", async () => {
    const { deps } = setup();
    expect(await getMyProfile(deps, "u")).toBeNull();
    expect(await code(saveMyProfile(deps, "u", { ...profile, pace: "warp" }))).toBe("invalid");
    await saveMyProfile(deps, "u", profile);
    await deps.stores.profiles.addPlacedOut("u", "app-anatomy", new Date());
    await saveMyProfile(deps, "u", { ...profile, pace: "light" });
    const got = await getMyProfile(deps, "u");
    expect(got?.profile.pace).toBe("light");
    expect(got?.placedOut).toEqual(["app-anatomy"]);
  });
  it("personalizes the dashboard: plan, daily goal, offers; none for a brand new user", async () => {
    const { deps, stores } = setup();
    const before = await getDashboard(stores.progress, "u", deps.now!(), new Set(), null);
    expect(before.plan).toBeNull();
    expect(before.dailyGoal.targetXp).toBe(40);
    const stored = await saveMyProfile(deps, "u", profile);
    const d = await getDashboard(stores.progress, "u", deps.now!(), new Set(), stored);
    expect(d.plan?.pathId).toBe("intermediate");
    expect(d.plan?.placementOffers).toContain("app-anatomy");
    expect(d.plan?.focusLessonId).toBeTruthy();
    const beginner = await saveMyProfile(deps, "u", { ...profile, experience: "new" });
    expect(
      (await getDashboard(stores.progress, "u", deps.now!(), new Set(), beginner)).plan
        ?.placementOffers,
    ).toEqual([]);
    const rescue = await saveMyProfile(deps, "u", { ...profile, intent: "rescue" });
    expect(
      (await getDashboard(stores.progress, "u", deps.now!(), new Set(), rescue)).plan?.projectFirst,
    ).toBe(true);
  });
});

describe("placement", () => {
  it("requires onboarding, serves solution-free questions and refuses unknown skills", async () => {
    const { deps } = setup();
    expect(await code(getPlacement(deps, "u", "app-anatomy"))).toBe("conflict");
    await saveMyProfile(deps, "u", profile);
    expect(await code(getPlacement(deps, "u", "nope"))).toBe("not_found");
    const check = await getPlacement(deps, "u", "app-anatomy");
    expect(check.exercises).toHaveLength(4);
    expect(JSON.stringify(check)).not.toMatch(/"solution"|"explanation"|"feedback"/);
  });
  it("cannot check a skill that is still locked", async () => {
    const { deps } = setup();
    await saveMyProfile(deps, "u", profile);
    expect(await code(getPlacement(deps, "u", "databases"))).toBe("forbidden");
  });
  it("a wrong or partial answer set does not place out and reveals no solutions", async () => {
    const { deps } = setup();
    await saveMyProfile(deps, "u", profile);
    const ids = placementExerciseIds("app-anatomy");
    const answers = Object.fromEntries(ids.map((id) => [id, correct(id)]));
    delete answers[ids[0]!];
    const r = await submitPlacement(deps, "u", "app-anatomy", { answers });
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/explanation|solution/);
    const junk = await submitPlacement(deps, "u", "app-anatomy", {
      answers: Object.fromEntries(ids.map((id) => [id, { nonsense: true }])),
    });
    expect(junk.passed).toBe(false);
    expect((await getMyProfile(deps, "u"))?.placedOut).toEqual([]);
  });
  it("passing unlocks dependents but grants no XP, mastery or achievements", async () => {
    const { deps, stores } = setup();
    await saveMyProfile(deps, "u", profile);
    const lockedBefore = await getLessonForUser(stores.progress, "u", "front-1");
    expect(lockedBefore).toBeNull();
    const ids = placementExerciseIds("app-anatomy");
    const r = await submitPlacement(deps, "u", "app-anatomy", {
      answers: Object.fromEntries(ids.map((id) => [id, correct(id)])),
    });
    expect(r.passed).toBe(true);
    expect(await code(getPlacement(deps, "u", "app-anatomy"))).toBe("conflict");
    const state = await stores.progress.load("u", "");
    expect(state.totalXp).toBe(0);
    expect(state.earnedAchievements.size).toBe(0);
    expect(state.passedExerciseIds.size).toBe(0);
    const d = await getDashboard(
      stores.progress,
      "u",
      deps.now!(),
      new Set(),
      await getMyProfile(deps, "u"),
    );
    const anatomy = d.path.skills.find((s) => s.skillId === "app-anatomy")!;
    expect(anatomy).toMatchObject({ unlocked: true, level: "none", points: 0 });
    expect(d.path.skills.find((s) => s.skillId === "frontend")!.unlocked).toBe(true);
    expect(d.plan?.placementOffers).not.toContain("app-anatomy"); // no repeat offer after passing
    expect(await getLessonForUser(stores.progress, "u", "front-1")).not.toBeNull();
    // and the learner can still earn real progress there
    const first = placementExerciseIds("frontend")[0]!;
    const out = await submitAttempt(stores.progress, {
      userId: "u",
      exerciseId: first,
      answer: correct(first),
    });
    expect(out.correct).toBe(true);
    expect(out.xpAwarded).toBeGreaterThan(0);
    expect((await stores.progress.load("u", "")).placedOut.has("app-anatomy")).toBe(true);
  });
});
