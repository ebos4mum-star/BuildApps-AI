import { INITIAL_STREAK, type Project } from "@buildapps/core";
import type {
  ApplyAttemptInput,
  ApplyAttemptResult,
  ProgressState,
  ProgressStore,
  ProjectStore,
  Stores,
} from "./store";

interface UserRow {
  totalXp: number;
  streak: typeof INITIAL_STREAK;
  version: number;
  timeZone: string;
  passed: Set<string>;
  attempts: Map<string, number>;
  awards: Map<string, { xp: number; source: string; occurredAt: string }>;
  achievements: Set<string>;
}

/** In-memory stores with the same integrity semantics as the SQL (idempotent keys, versioning). */
export class MemoryProgressStore implements ProgressStore {
  readonly users = new Map<string, UserRow>();
  /** Test hook: runs before each apply() to simulate a concurrent writer. */
  beforeApply?: () => void;

  private row(userId: string): UserRow {
    let r = this.users.get(userId);
    if (!r) {
      r = {
        totalXp: 0,
        streak: { ...INITIAL_STREAK },
        version: 0,
        timeZone: "UTC",
        passed: new Set(),
        attempts: new Map(),
        awards: new Map(),
        achievements: new Set(),
      };
      this.users.set(userId, r);
    }
    return r;
  }
  async load(userId: string, exerciseId: string): Promise<ProgressState> {
    const r = this.row(userId);
    return {
      passedExerciseIds: new Set(r.passed),
      awardKeys: new Set(r.awards.keys()),
      recentExerciseAwards: [...r.awards.values()]
        .filter((a) => a.source === "exercise")
        .map((a) => ({ occurredAt: a.occurredAt, xp: a.xp })),
      totalXp: r.totalXp,
      streak: { ...r.streak },
      version: r.version,
      earnedAchievements: new Set(r.achievements),
      timeZone: r.timeZone,
      verifiedMilestones: 0,
      verifiedProjectsCompleted: 0,
      priorAttempts: r.attempts.get(exerciseId) ?? 0,
    };
  }
  async apply(i: ApplyAttemptInput): Promise<ApplyAttemptResult> {
    this.beforeApply?.();
    const r = this.row(i.userId);
    if (r.version !== i.expectedVersion) return { status: "conflict" };
    r.attempts.set(i.exerciseId, (r.attempts.get(i.exerciseId) ?? 0) + 1);
    if (i.passed) r.passed.add(i.exerciseId);
    let added = 0;
    for (const a of i.awards) {
      if (r.awards.has(a.awardKey)) continue;
      r.awards.set(a.awardKey, { xp: a.xp, source: a.source, occurredAt: a.occurredAt });
      added += a.xp;
    }
    i.achievements.forEach((id) => r.achievements.add(id));
    r.totalXp += added;
    r.streak = { ...i.streak, longest: Math.max(r.streak.longest, i.streak.longest) };
    r.version++;
    return { status: "ok", xpAdded: added, totalXp: r.totalXp };
  }
  async setTimeZone(userId: string, tz: string) {
    this.row(userId).timeZone = tz;
  }
}

export class MemoryProjectStore implements ProjectStore {
  readonly rows = new Map<string, Project>();
  async create(p: Project) {
    this.rows.set(p.id, structuredClone(p));
  }
  async list(ownerId: string) {
    return [...this.rows.values()]
      .filter((p) => p.ownerId === ownerId)
      .map((p) => structuredClone(p))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(ownerId: string, id: string) {
    const p = this.rows.get(id);
    return p && p.ownerId === ownerId ? structuredClone(p) : null;
  }
  async save(p: Project) {
    const cur = this.rows.get(p.id);
    if (!cur || cur.ownerId !== p.ownerId) throw new Error("Project not found");
    this.rows.set(p.id, structuredClone(p));
  }
}

export const createMemoryStores = (): Stores & {
  progress: MemoryProgressStore;
  projects: MemoryProjectStore;
} => ({
  progress: new MemoryProgressStore(),
  projects: new MemoryProjectStore(),
});
