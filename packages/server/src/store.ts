import type { Project, StreakState } from "@buildapps/core";

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
}

export interface Stores {
  progress: ProgressStore;
  projects: ProjectStore;
}
