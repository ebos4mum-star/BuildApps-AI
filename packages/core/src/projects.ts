import { z } from "zod";

export const PROJECT_JOURNEYS = ["start", "continue", "rescue"] as const;
export type ProjectJourney = (typeof PROJECT_JOURNEYS)[number];
export function isProjectJourney(value: unknown): value is ProjectJourney {
  return typeof value === "string" && (PROJECT_JOURNEYS as readonly string[]).includes(value);
}

export const PROJECT_STATES = [
  "draft",
  "active",
  "needs_help",
  "in_verification",
  "completed",
  "archived",
] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

export const PROJECT_TRANSITIONS: Readonly<Record<ProjectState, readonly ProjectState[]>> = {
  draft: ["active", "archived"],
  active: ["needs_help", "in_verification", "completed", "archived"],
  needs_help: ["active", "archived"],
  in_verification: ["active", "completed", "archived"],
  completed: ["active", "archived"],
  archived: ["active"],
};

export type CompletionSource = "user_reported" | "verified";
export type MilestoneStatus = "todo" | "in_progress" | "done";

export interface Milestone {
  id: string;
  title: string;
  /** Required milestones gate project completion. Optional ones (e.g. publishing) do not. */
  required: boolean;
  /** Relative weight 1..10 used for progress. */
  weight: number;
  status: MilestoneStatus;
  completion: { source: CompletionSource; at: string; evidenceRef?: string } | null;
}

export type RescueStage = "assess" | "triage" | "plan" | "resume";
export const RESCUE_STAGES: readonly RescueStage[] = ["assess", "triage", "plan", "resume"];

export interface RepoRef {
  provider: "github";
  owner: string;
  name: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  journey: ProjectJourney;
  state: ProjectState;
  milestones: Milestone[];
  repo: RepoRef | null;
  /** Journey-specific data; only the rescue journey has recovery state. */
  recovery: { stage: RescueStage; humanHelpRequested: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ProjectState,
    readonly to: ProjectState,
    readonly reason: "not_allowed" | "required_milestones_incomplete",
  ) {
    super(`Cannot move project from ${from} to ${to}: ${reason}`);
  }
}

const iso = (d: Date | string): string => {
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) throw new RangeError("Invalid date");
  return x.toISOString();
};

export const milestoneSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  required: z.boolean().default(true),
  weight: z.number().int().min(1).max(10).default(1),
});

export function makeMilestones(defs: readonly z.input<typeof milestoneSchema>[]): Milestone[] {
  const ids = new Set<string>();
  return defs.map((d) => {
    const m = milestoneSchema.parse(d);
    if (ids.has(m.id)) throw new Error(`Duplicate milestone id: ${m.id}`);
    ids.add(m.id);
    return { ...m, status: "todo", completion: null };
  });
}

export function requiredMilestonesDone(p: Pick<Project, "milestones">): boolean {
  const required = p.milestones.filter((m) => m.required);
  return required.length > 0 && required.every((m) => m.status === "done");
}

export function transitionProject(p: Project, to: ProjectState, now: Date | string): Project {
  if (!PROJECT_TRANSITIONS[p.state].includes(to))
    throw new InvalidTransitionError(p.state, to, "not_allowed");
  if (to === "completed" && !requiredMilestonesDone(p))
    throw new InvalidTransitionError(p.state, to, "required_milestones_incomplete");
  return { ...p, state: to, updatedAt: iso(now) };
}

/**
 * Marks a milestone done. "verified" requires an evidenceRef (e.g. a verification run id, written
 * by the server). A verified completion is never downgraded; a user_reported one can be upgraded.
 */
export function completeMilestone(
  p: Project,
  milestoneId: string,
  source: CompletionSource,
  now: Date | string,
  evidenceRef?: string,
): Project {
  if (p.state === "archived" || p.state === "draft")
    throw new Error(`Cannot complete milestones while project is ${p.state}`);
  if (source === "verified" && !evidenceRef)
    throw new Error("Verified completion requires evidenceRef");
  const target = p.milestones.find((m) => m.id === milestoneId);
  if (!target) throw new Error(`Unknown milestone: ${milestoneId}`);
  if (target.completion?.source === "verified") return p; // idempotent, never downgrade
  if (target.completion?.source === "user_reported" && source === "user_reported") return p;
  const at = iso(now);
  const milestones = p.milestones.map((m) =>
    m.id === milestoneId
      ? {
          ...m,
          status: "done" as const,
          completion: { source, at, ...(evidenceRef ? { evidenceRef } : {}) },
        }
      : m,
  );
  return { ...p, milestones, updatedAt: at };
}

export interface ProgressSummary {
  /** 0..100, all completed work (reported + verified). */
  overallPercent: number;
  /** 0..100, only automatically verified work. */
  verifiedPercent: number;
  doneCount: number;
  verifiedCount: number;
  totalCount: number;
  completion: "incomplete" | "user_reported" | "verified";
}

export function calculateProgress(milestones: readonly Milestone[]): ProgressSummary {
  const total = milestones.reduce((s, m) => s + m.weight, 0);
  const sum = (f: (m: Milestone) => boolean) =>
    milestones.filter(f).reduce((s, m) => s + m.weight, 0);
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const required = milestones.filter((m) => m.required);
  const allRequiredDone = required.length > 0 && required.every((m) => m.status === "done");
  const allRequiredVerified =
    allRequiredDone && required.every((m) => m.completion?.source === "verified");
  return {
    overallPercent: pct(sum((m) => m.status === "done")),
    verifiedPercent: pct(sum((m) => m.completion?.source === "verified")),
    doneCount: milestones.filter((m) => m.status === "done").length,
    verifiedCount: milestones.filter((m) => m.completion?.source === "verified").length,
    totalCount: milestones.length,
    completion: allRequiredVerified ? "verified" : allRequiredDone ? "user_reported" : "incomplete",
  };
}

const GITHUB_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
/** Accepts only plain https://github.com/<owner>/<repo> URLs. */
export function parseGitHubRepo(url: string): RepoRef | null {
  const m = GITHUB_URL.exec(url.trim());
  if (!m || !m[1] || !m[2] || m[2] === "." || m[2] === "..") return null;
  return { provider: "github", owner: m[1], name: m[2] };
}
