import type { Project, RepoRef, StreakState } from "@buildapps/core";
import type { GitHubStore, RescueStore, ScanStore } from "./batch2-types";

/** Everything the attempt service needs to know about a user, loaded in one go. */
export interface ProgressState {
  passedExerciseIds: Set<string>;
  awardKeys: Set<string>;
  /** Recent exercise XP awards (enough history to compute "today" in any timezone). */
  recentExerciseAwards: { occurredAt: string; xp: number }[];
  totalXp: number;
  streak: StreakState;
  version: number;
  earnedAchievements: Set<string>;
  timeZone: string;
  verifiedMilestones: number;
  verifiedProjectsCompleted: number;
  /** Persisted attempts the user already made on the requested exercise. */
  priorAttempts: number;
}

export interface ApplyAttemptInput {
  userId: string;
  exerciseId: string;
  passed: boolean;
  expectedVersion: number;
  awards: { awardKey: string; source: string; xp: number; occurredAt: string }[];
  achievements: string[];
  streak: StreakState;
}
export type ApplyAttemptResult =
  { status: "ok"; xpAdded: number; totalXp: number } | { status: "conflict" };

/** Persistence port for learning progress. Implemented by Supabase (prod) and memory (tests/dev). */
export interface ProgressStore {
  load(userId: string, exerciseId: string): Promise<ProgressState>;
  apply(input: ApplyAttemptInput): Promise<ApplyAttemptResult>;
  setTimeZone(userId: string, tz: string): Promise<void>;
  /** Idempotent XP/achievement grant outside the exercise flow (e.g. verified milestones). */
  grant(input: {
    userId: string;
    awards: ApplyAttemptInput["awards"];
    achievements: string[];
  }): Promise<{ xpAdded: number; totalXp: number }>;
}

/** Persistence port for projects. All writes happen server-side after core validation. */
export interface ProjectStore {
  create(project: Project): Promise<void>;
  list(ownerId: string): Promise<Project[]>;
  get(ownerId: string, id: string): Promise<Project | null>;
  /** Persists state/milestones/recovery of an existing project owned by `project.ownerId`. */
  save(project: Project): Promise<void>;
  /** Human Developer Rescue intake: queued for manual matching by the team. */
  createServiceRequest(ownerId: string, projectId: string, summary: string): Promise<void>;
  /** GitHub App installation row (not the GitHub id) this project is linked to, if any. */
  getGithubLink(ownerId: string, projectId: string): Promise<{ installationRowId: string | null }>;
  /** Links a project to one repository inside a connected installation. */
  setRepo(
    ownerId: string,
    projectId: string,
    repo: RepoRef,
    installationRowId: string,
  ): Promise<void>;
  /** Called when GitHub reports a repo was removed from an installation. */
  unlinkRepo(githubInstallationId: number, owner: string, name: string): Promise<void>;
}

export interface Stores {
  progress: ProgressStore;
  projects: ProjectStore;
  github: GitHubStore;
  scans: ScanStore;
  rescue: RescueStore;
}
