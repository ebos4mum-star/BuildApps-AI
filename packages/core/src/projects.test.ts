import { describe, expect, it } from "vitest";
import { advanceRecovery, createProject, requestHumanHelp, type ProjectIntake } from "./journeys";
import {
  calculateProgress,
  completeMilestone,
  InvalidTransitionError,
  parseGitHubRepo,
  transitionProject,
  type Project,
} from "./projects";

const NOW = "2026-01-01T00:00:00Z";
const intakes: Record<string, ProjectIntake> = {
  start: {
    journey: "start",
    name: "My App",
    idea: "A habit tracker for students",
    platform: "web",
  },
  continue: { journey: "continue", name: "Half done", description: "Login works, rest does not" },
  rescue: {
    journey: "rescue",
    name: "Stuck",
    repoUrl: "https://github.com/octo/stuck.git",
    problem: "Build fails after AI edits",
  },
};
const make = (k: keyof typeof intakes) =>
  createProject({ id: "p1", ownerId: "u1", intake: intakes[k]! }, NOW);
const activate = (p: Project) => transitionProject(p, "active", NOW);

describe("journeys", () => {
  it("share one project model with journey-specific parts", () => {
    const [s, c, r] = [make("start"), make("continue"), make("rescue")];
    for (const p of [s, c, r]) expect(p).toMatchObject({ state: "draft", ownerId: "u1" });
    expect(s.recovery).toBeNull();
    expect(c.repo).toBeNull();
    expect(r.repo).toEqual({ provider: "github", owner: "octo", name: "stuck" });
    expect(r.recovery).toEqual({ stage: "assess", humanHelpRequested: false });
    expect(r.milestones.map((m) => m.id)).toContain("restore-build");
  });
  it("validates intake", () => {
    expect(() =>
      createProject(
        {
          id: "p",
          ownerId: "u",
          intake: { ...intakes.rescue!, repoUrl: "https://evil.com/a/b" } as never,
        },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      createProject(
        {
          id: "p",
          ownerId: "u",
          intake: { journey: "start", name: "", idea: "x", platform: "web" },
        },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      createProject({ id: "p", ownerId: "u", intake: { journey: "bogus" } as never }, NOW),
    ).toThrow();
  });
  it("advances rescue recovery one stage at a time and supports human help requests", () => {
    let r = make("rescue");
    for (const s of ["triage", "plan", "resume"]) {
      r = advanceRecovery(r, NOW);
      expect(r.recovery?.stage).toBe(s);
    }
    expect(() => advanceRecovery(r, NOW)).toThrow();
    expect(requestHumanHelp(r, NOW).recovery?.humanHelpRequested).toBe(true);
    expect(() => requestHumanHelp(make("start"), NOW)).toThrow();
  });
});

describe("lifecycle", () => {
  it("allows valid and rejects invalid transitions", () => {
    const p = make("start");
    expect(() => transitionProject(p, "completed", NOW)).toThrow(InvalidTransitionError);
    expect(activate(p).state).toBe("active");
    expect(() => transitionProject(activate(p), "draft", NOW)).toThrow(InvalidTransitionError);
  });
  it("blocks completion until required milestones are done (optional ones don't block)", () => {
    let p = activate(make("continue"));
    expect(() => transitionProject(p, "completed", NOW)).toThrow(/required_milestones/);
    for (const m of p.milestones.filter((m) => m.required))
      p = completeMilestone(p, m.id, "user_reported", NOW);
    expect(transitionProject(p, "completed", NOW).state).toBe("completed");
  });
  it("cannot complete milestones in draft or archived", () => {
    expect(() => completeMilestone(make("start"), "define-scope", "user_reported", NOW)).toThrow();
  });
});

describe("milestones & progress", () => {
  it("distinguishes user-reported from verified completion", () => {
    let p = activate(make("continue"));
    p = completeMilestone(p, "review-state", "user_reported", NOW);
    p = completeMilestone(p, "finish-features", "verified", NOW, "run-1");
    expect(calculateProgress(p.milestones)).toMatchObject({
      overallPercent: 50,
      verifiedPercent: 40,
      doneCount: 2,
      verifiedCount: 1,
      completion: "incomplete",
    });
    p = completeMilestone(p, "tests-pass", "user_reported", NOW);
    expect(calculateProgress(p.milestones).completion).toBe("user_reported");
    p = completeMilestone(p, "review-state", "verified", NOW, "run-2");
    p = completeMilestone(p, "tests-pass", "verified", NOW, "run-3");
    expect(calculateProgress(p.milestones).completion).toBe("verified");
  });
  it("requires evidence for verified, never downgrades, and rejects unknown ids", () => {
    let p = activate(make("continue"));
    expect(() => completeMilestone(p, "review-state", "verified", NOW)).toThrow(/evidenceRef/);
    expect(() => completeMilestone(p, "nope", "user_reported", NOW)).toThrow(/Unknown/);
    p = completeMilestone(p, "review-state", "verified", NOW, "r1");
    expect(completeMilestone(p, "review-state", "user_reported", NOW)).toBe(p);
  });
  it("handles empty milestone lists", () => {
    expect(calculateProgress([])).toMatchObject({ overallPercent: 0, completion: "incomplete" });
  });
});

describe("parseGitHubRepo", () => {
  it("accepts plain https github URLs only", () => {
    expect(parseGitHubRepo("https://github.com/a/b")).toEqual({
      provider: "github",
      owner: "a",
      name: "b",
    });
    expect(parseGitHubRepo("https://github.com/a/b/")?.name).toBe("b");
    for (const bad of [
      "http://github.com/a/b",
      "https://github.com/a",
      "https://github.com/a/b/tree/x",
      "git@github.com:a/b.git",
      "https://github.com.evil.io/a/b",
      "https://github.com/a/..",
    ])
      expect(parseGitHubRepo(bad)).toBeNull();
  });
});
