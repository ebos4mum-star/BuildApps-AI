import { z } from "zod";
import {
  makeMilestones,
  parseGitHubRepo,
  RESCUE_STAGES,
  type Project,
  type ProjectJourney,
  type RescueStage,
} from "./projects";

/** All journeys produce the same Project shape; only intake, milestones and recovery differ. */
export const startIntakeSchema = z.object({
  journey: z.literal("start"),
  name: z.string().min(1).max(100),
  idea: z.string().min(10).max(2000),
  platform: z.enum(["web", "ios", "android", "cross_platform"]),
});
export const continueIntakeSchema = z.object({
  journey: z.literal("continue"),
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  repoUrl: z.string().optional(),
});
export const rescueIntakeSchema = z.object({
  journey: z.literal("rescue"),
  name: z.string().min(1).max(100),
  repoUrl: z.string(),
  problem: z.string().min(10).max(2000),
});
export const intakeSchema = z.discriminatedUnion("journey", [
  startIntakeSchema,
  continueIntakeSchema,
  rescueIntakeSchema,
]);
export type ProjectIntake = z.input<typeof intakeSchema>;

export interface JourneyConfig {
  journey: ProjectJourney;
  title: string;
  onboardingSteps: readonly string[];
}

export const JOURNEYS: Readonly<Record<ProjectJourney, JourneyConfig>> = {
  start: {
    journey: "start",
    title: "Start a Project",
    onboardingSteps: ["describe_idea", "choose_platform", "scope_first_milestone"],
  },
  continue: {
    journey: "continue",
    title: "Continue a Project",
    onboardingSteps: ["describe_current_state", "connect_repo_optional", "pick_next_milestone"],
  },
  rescue: {
    journey: "rescue",
    title: "Rescue a Project",
    onboardingSteps: [
      "connect_repo_readonly",
      "describe_problem",
      "run_scan",
      "review_findings",
      "choose_plan",
    ],
  },
};

// Publishing assistance is a separate paid service, so its milestone is optional.
const PUBLISH = { id: "publish-ready", title: "Ready to publish", required: false, weight: 2 };
const TESTS = { id: "tests-pass", title: "Automated checks pass", required: true, weight: 3 };

const TEMPLATES = {
  start: [
    { id: "define-scope", title: "Define scope", weight: 1 },
    { id: "prototype", title: "Working prototype", weight: 3 },
    { id: "core-features", title: "Core features built", weight: 4 },
    TESTS,
    PUBLISH,
  ],
  continue: [
    { id: "review-state", title: "Review current state", weight: 1 },
    { id: "finish-features", title: "Finish outstanding features", weight: 4 },
    TESTS,
    PUBLISH,
  ],
  rescue: [
    { id: "assess", title: "Assess project health", weight: 1 },
    { id: "fix-blockers", title: "Fix blocking problems", weight: 4 },
    { id: "restore-build", title: "Restore a working build", weight: 3 },
    TESTS,
    PUBLISH,
  ],
} as const;

export function createProject(
  args: { id: string; ownerId: string; intake: ProjectIntake },
  now: Date | string,
): Project {
  const intake = intakeSchema.parse(args.intake);
  const at = (typeof now === "string" ? new Date(now) : now).toISOString();

  let repo = null;
  if (intake.journey === "rescue") {
    repo = parseGitHubRepo(intake.repoUrl);
    if (!repo) throw new Error("Rescue requires a valid https://github.com/<owner>/<repo> URL");
  } else if (intake.journey === "continue" && intake.repoUrl) {
    repo = parseGitHubRepo(intake.repoUrl);
    if (!repo) throw new Error("Invalid GitHub repository URL");
  }

  return {
    id: args.id,
    ownerId: args.ownerId,
    name: intake.name,
    journey: intake.journey,
    state: "draft",
    milestones: makeMilestones(TEMPLATES[intake.journey]),
    repo,
    recovery: intake.journey === "rescue" ? { stage: "assess", humanHelpRequested: false } : null,
    createdAt: at,
    updatedAt: at,
  };
}

/** Rescue recovery moves forward one stage at a time. */
export function advanceRecovery(p: Project, now: Date | string): Project {
  if (!p.recovery) throw new Error("Project has no recovery workflow");
  const next: RescueStage | undefined = RESCUE_STAGES[RESCUE_STAGES.indexOf(p.recovery.stage) + 1];
  if (!next) throw new Error("Recovery is already at its final stage");
  return {
    ...p,
    recovery: { ...p.recovery, stage: next },
    updatedAt: (typeof now === "string" ? new Date(now) : now).toISOString(),
  };
}

/** Flags that the owner wants a vetted expert (Human Developer Rescue). Matching is manual later. */
export function requestHumanHelp(p: Project, now: Date | string): Project {
  if (!p.recovery) throw new Error("Human help requests are part of the rescue journey");
  return {
    ...p,
    recovery: { ...p.recovery, humanHelpRequested: true },
    updatedAt: (typeof now === "string" ? new Date(now) : now).toISOString(),
  };
}
