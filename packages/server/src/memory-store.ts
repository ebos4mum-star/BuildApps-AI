import { calculateProgress, INITIAL_STREAK, type Project, type RepoRef } from "@buildapps/core";
import type { InstallationInfo } from "@buildapps/github/types";
import { MemoryProfileStore } from "./profile-store";
import { mergeFindings } from "./merge-findings";
import { MemoryPublishingStore } from "./publishing-memory-store";
import type {
  ActionRow,
  ClaimRow,
  FeedbackRow,
  PublishEventRow,
  PublishTargetRow,
  ReleaseRow,
  SubmissionRow,
} from "./publishing-types";
import type {
  EventRole,
  RequestEventRow,
  ExpertRow,
  ExpertStatus,
  FindingRow,
  GitHubStore,
  HandoffRow,
  InstallationRow,
  JobMilestoneRow,
  RequestStatus,
  RescueStore,
  ScanRow,
  ScanStore,
  ServiceRequestRow,
  VerificationRunRow,
} from "./batch2-types";
import type {
  ApplyAttemptInput,
  ApplyAttemptResult,
  ProgressState,
  ProgressStore,
  ProjectStore,
  Stores,
} from "./store";

const uuid = () => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

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

/** One shared in-memory "database" so every memory store sees consistent data. */
export class MemoryDb {
  users = new Map<string, UserRow>();
  profiles = new MemoryProfileStore();
  projects = new Map<string, Project>();
  projectLinks = new Map<string, string>(); // projectId -> installation row id
  installations = new Map<string, InstallationRow>();
  scans = new Map<string, ScanRow>();
  findings = new Map<string, FindingRow>();
  verifications: VerificationRunRow[] = [];
  experts = new Map<string, ExpertRow>();
  admins = new Set<string>();
  requests = new Map<string, ServiceRequestRow>();
  handoffs = new Map<string, HandoffRow>();
  jobs = new Map<string, JobMilestoneRow>();
  events: RequestEventRow[] = [];
  pubTargets = new Map<string, PublishTargetRow>();
  pubClaims = new Map<string, ClaimRow>();
  pubReleases = new Map<string, ReleaseRow>();
  pubSubmissions = new Map<string, SubmissionRow>();
  pubFeedback = new Map<string, FeedbackRow>();
  pubActions = new Map<string, ActionRow>();
  pubEvents: PublishEventRow[] = [];
}

/** In-memory stores with the same integrity semantics as the SQL (idempotent keys, versioning). */
export class MemoryProgressStore implements ProgressStore {
  /** Test hook: runs before each apply() to simulate a concurrent writer. */
  beforeApply?: () => void;
  constructor(private readonly db: MemoryDb = new MemoryDb()) {}
  get users() {
    return this.db.users;
  }
  private row(userId: string): UserRow {
    let r = this.db.users.get(userId);
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
      this.db.users.set(userId, r);
    }
    return r;
  }
  async load(userId: string, exerciseId: string): Promise<ProgressState> {
    const r = this.row(userId);
    const mine = [...this.db.projects.values()].filter((p) => p.ownerId === userId);
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
      placedOut: new Set(this.db.profiles.rows.get(userId)?.placedOut ?? []),
      timeZone: r.timeZone,
      verifiedMilestones: mine
        .flatMap((p) => p.milestones)
        .filter((m) => m.completion?.source === "verified").length,
      verifiedProjectsCompleted: mine.filter(
        (p) => p.state === "completed" && calculateProgress(p.milestones).completion === "verified",
      ).length,
      priorAttempts: r.attempts.get(exerciseId) ?? 0,
    };
  }
  async apply(i: ApplyAttemptInput): Promise<ApplyAttemptResult> {
    this.beforeApply?.();
    const r = this.row(i.userId);
    if (r.version !== i.expectedVersion) return { status: "conflict" };
    r.attempts.set(i.exerciseId, (r.attempts.get(i.exerciseId) ?? 0) + 1);
    if (i.passed) r.passed.add(i.exerciseId);
    const added = this.addAwards(r, i.awards);
    i.achievements.forEach((id) => r.achievements.add(id));
    r.totalXp += added;
    r.streak = { ...i.streak, longest: Math.max(r.streak.longest, i.streak.longest) };
    r.version++;
    return { status: "ok", xpAdded: added, totalXp: r.totalXp };
  }
  private addAwards(r: UserRow, awards: ApplyAttemptInput["awards"]): number {
    let added = 0;
    for (const a of awards) {
      if (r.awards.has(a.awardKey)) continue;
      r.awards.set(a.awardKey, { xp: a.xp, source: a.source, occurredAt: a.occurredAt });
      added += a.xp;
    }
    return added;
  }
  async grant(i: { userId: string; awards: ApplyAttemptInput["awards"]; achievements: string[] }) {
    const r = this.row(i.userId);
    const added = this.addAwards(r, i.awards);
    i.achievements.forEach((id) => r.achievements.add(id));
    r.totalXp += added;
    return { xpAdded: added, totalXp: r.totalXp };
  }
  async setTimeZone(userId: string, tz: string) {
    this.row(userId).timeZone = tz;
  }
}

export class MemoryProjectStore implements ProjectStore {
  constructor(private readonly db: MemoryDb = new MemoryDb()) {}
  get rows() {
    return this.db.projects;
  }
  get serviceRequests() {
    return [...this.db.requests.values()].map((r) => ({
      ownerId: r.requesterId,
      projectId: r.projectId,
      summary: r.summary,
    }));
  }
  async hasOpenServiceRequest(ownerId: string, projectId: string, kind?: "rescue" | "publishing") {
    return [...this.db.requests.values()].some(
      (r) =>
        r.requesterId === ownerId &&
        r.projectId === projectId &&
        (!kind || r.kind === kind) &&
        ["submitted", "matched", "in_progress", "delivered"].includes(r.status),
    );
  }

  async createServiceRequest(
    ownerId: string,
    projectId: string,
    summary: string,
    opts: { kind?: "rescue" | "publishing"; publishTargetId?: string | null } = {},
  ) {
    const id = uuid();
    this.db.requests.set(id, {
      id,
      projectId,
      requesterId: ownerId,
      summary,
      status: "submitted",
      assignedExpertId: null,
      matchedAt: null,
      completedAt: null,
      completionEvidence: null,
      kind: opts.kind ?? "rescue",
      publishTargetId: opts.publishTargetId ?? null,
      createdAt: new Date().toISOString(),
    });
    this.db.events.push({
      id: String(this.db.events.length + 1),
      serviceRequestId: id,
      actorId: ownerId,
      actorRole: "owner",
      action: "request_created",
      detail: {},
      createdAt: new Date().toISOString(),
    });
    return id;
  }
  async create(p: Project) {
    this.db.projects.set(p.id, clone(p));
  }
  async list(ownerId: string) {
    return [...this.db.projects.values()]
      .filter((p) => p.ownerId === ownerId)
      .map(clone)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(ownerId: string, id: string) {
    const p = this.db.projects.get(id);
    return p && p.ownerId === ownerId ? clone(p) : null;
  }
  async save(p: Project) {
    const cur = this.db.projects.get(p.id);
    if (!cur || cur.ownerId !== p.ownerId) throw new Error("Project not found");
    this.db.projects.set(p.id, clone(p));
  }
  async getGithubLink(ownerId: string, projectId: string) {
    const p = this.db.projects.get(projectId);
    return {
      installationRowId:
        p && p.ownerId === ownerId ? (this.db.projectLinks.get(projectId) ?? null) : null,
    };
  }
  async setRepo(ownerId: string, projectId: string, repo: RepoRef, installationRowId: string) {
    const p = this.db.projects.get(projectId);
    if (!p || p.ownerId !== ownerId) throw new Error("Project not found");
    p.repo = repo;
    this.db.projectLinks.set(projectId, installationRowId);
  }
  async unlinkRepo(githubInstallationId: number, owner: string, name: string) {
    for (const [projectId, rowId] of this.db.projectLinks) {
      const inst = this.db.installations.get(rowId);
      const p = this.db.projects.get(projectId);
      if (
        inst?.installationId === githubInstallationId &&
        p?.repo?.owner === owner &&
        p.repo.name === name
      )
        this.db.projectLinks.delete(projectId);
    }
  }
}

export class MemoryGitHubStore implements GitHubStore {
  constructor(private readonly db: MemoryDb = new MemoryDb()) {}
  async upsertInstallation(userId: string, info: InstallationInfo) {
    const existing = [...this.db.installations.values()].find(
      (i) => i.userId === userId && i.installationId === info.installationId,
    );
    const row: InstallationRow = {
      id: existing?.id ?? uuid(),
      userId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...info,
    };
    this.db.installations.set(row.id, row);
    return clone(row);
  }
  async listInstallations(userId: string) {
    return [...this.db.installations.values()].filter((i) => i.userId === userId).map(clone);
  }
  async getInstallation(userId: string, rowId: string) {
    const r = this.db.installations.get(rowId);
    return r && r.userId === userId ? clone(r) : null;
  }
  async findByGithubId(installationId: number) {
    return [...this.db.installations.values()]
      .filter((i) => i.installationId === installationId)
      .map(clone);
  }
  private drop(rowId: string) {
    this.db.installations.delete(rowId);
    for (const [pid, rid] of this.db.projectLinks)
      if (rid === rowId) this.db.projectLinks.delete(pid);
  }
  async deleteInstallation(userId: string, rowId: string) {
    if (this.db.installations.get(rowId)?.userId === userId) this.drop(rowId);
  }
  async deleteByGithubId(installationId: number) {
    for (const r of [...this.db.installations.values()])
      if (r.installationId === installationId) this.drop(r.id);
  }
}

export class MemoryScanStore implements ScanStore {
  constructor(private readonly db: MemoryDb = new MemoryDb()) {}
  async createScan(i: { projectId: string; requestedBy: string; now: Date }) {
    const row: ScanRow = {
      id: uuid(),
      projectId: i.projectId,
      requestedBy: i.requestedBy,
      commitSha: null,
      ref: null,
      status: "running",
      stats: {},
      assessment: null,
      error: null,
      createdAt: i.now.toISOString(),
      completedAt: null,
    };
    this.db.scans.set(row.id, row);
    return clone(row);
  }
  async completeScan(
    id: string,
    p: {
      commitSha: string | null;
      ref: string | null;
      stats: Record<string, unknown>;
      assessment: ScanRow["assessment"];
      now: Date;
    },
  ) {
    const s = this.db.scans.get(id)!;
    Object.assign(s, {
      status: "complete",
      commitSha: p.commitSha,
      ref: p.ref,
      stats: p.stats,
      assessment: p.assessment,
      completedAt: p.now.toISOString(),
    });
  }
  async failScan(id: string, error: string, now: Date) {
    Object.assign(this.db.scans.get(id)!, {
      status: "failed",
      error,
      completedAt: now.toISOString(),
    });
  }
  async syncFindings(
    projectId: string,
    scanId: string,
    incoming: Parameters<ScanStore["syncFindings"]>[2],
  ) {
    const existing = [...this.db.findings.values()].filter((f) => f.projectId === projectId);
    const { rows, stats } = mergeFindings(projectId, existing, incoming, scanId, new Date(), uuid);
    for (const r of rows) this.db.findings.set(r.id, r);
    return stats;
  }
  async listFindings(projectId: string) {
    return [...this.db.findings.values()].filter((f) => f.projectId === projectId).map(clone);
  }
  async getFinding(projectId: string, id: string) {
    const f = this.db.findings.get(id);
    return f && f.projectId === projectId ? clone(f) : null;
  }
  async updateFinding(projectId: string, id: string, p: Parameters<ScanStore["updateFinding"]>[2]) {
    const f = this.db.findings.get(id);
    if (!f || f.projectId !== projectId) throw new Error("Finding not found");
    Object.assign(f, {
      status: p.status,
      statusNote: p.statusNote,
      decidedByUser: p.decidedByUser,
      resolutionSource: p.resolutionSource,
      updatedAt: p.now.toISOString(),
    });
    return clone(f);
  }
  async latestScan(projectId: string) {
    // ties on createdAt resolve to the most recently inserted row
    const all = [...this.db.scans.values()].filter(
      (s) => s.projectId === projectId && s.status === "complete",
    );
    const latest = all.reduce<ScanRow | null>(
      (a, b) => (!a || b.createdAt >= a.createdAt ? b : a),
      null,
    );
    return latest ? clone(latest) : null;
  }
  async countScansSince(projectId: string, since: Date) {
    return [...this.db.scans.values()].filter(
      (s) => s.projectId === projectId && new Date(s.createdAt) >= since,
    ).length;
  }
  async createVerificationRun(i: Parameters<ScanStore["createVerificationRun"]>[0]) {
    const row: VerificationRunRow = {
      id: uuid(),
      projectId: i.projectId,
      requestedBy: i.requestedBy,
      commitSha: i.commitSha,
      status: i.status,
      checks: i.checks,
      createdAt: i.now.toISOString(),
    };
    this.db.verifications.push(row);
    return clone(row);
  }
  async latestVerification(projectId: string) {
    const all = this.db.verifications.filter((r) => r.projectId === projectId);
    const latest = all.reduce<VerificationRunRow | null>(
      (a, b) => (!a || b.createdAt >= a.createdAt ? b : a),
      null,
    );
    return latest ? clone(latest) : null;
  }
}

export class MemoryRescueStore implements RescueStore {
  constructor(private readonly db: MemoryDb = new MemoryDb()) {}
  async isAdmin(userId: string) {
    return this.db.admins.has(userId);
  }
  async addEvent(
    requestId: string,
    actorId: string | null,
    role: EventRole,
    action: string,
    detail: Record<string, unknown>,
    now: Date,
  ) {
    this.db.events.push({
      id: String(this.db.events.length + 1),
      serviceRequestId: requestId,
      actorId,
      actorRole: role,
      action,
      detail,
      createdAt: now.toISOString(),
    });
  }
  async listEvents(requestId: string) {
    return this.db.events.filter((e) => e.serviceRequestId === requestId).map(clone);
  }
  async upsertExpertApplication(
    userId: string,
    i: { displayName: string; headline: string | null; bio: string | null; skills: string[] },
  ) {
    const cur = [...this.db.experts.values()].find((e) => e.userId === userId);
    const row: ExpertRow = cur ?? {
      id: uuid(),
      userId,
      displayName: i.displayName,
      headline: null,
      bio: null,
      skills: [],
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
    };
    Object.assign(row, i);
    // an approved/suspended expert editing their profile keeps their status; a rejected one re-applies
    if (row.status === "rejected")
      Object.assign(row, {
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });
    this.db.experts.set(row.id, row);
    return clone(row);
  }
  async getExpertByUser(userId: string) {
    const e = [...this.db.experts.values()].find((x) => x.userId === userId);
    return e ? clone(e) : null;
  }
  async getExpert(id: string) {
    const e = this.db.experts.get(id);
    return e ? clone(e) : null;
  }
  async listExperts(status?: ExpertStatus) {
    return [...this.db.experts.values()].filter((e) => !status || e.status === status).map(clone);
  }
  async reviewExpert(
    id: string,
    adminId: string,
    status: ExpertStatus,
    note: string | null,
    now: Date,
  ) {
    const e = this.db.experts.get(id)!;
    Object.assign(e, {
      status,
      reviewedBy: adminId,
      reviewedAt: now.toISOString(),
      reviewNote: note,
    });
    return clone(e);
  }
  async getRequest(id: string) {
    const r = this.db.requests.get(id);
    return r ? clone(r) : null;
  }
  async listRequestsForRequester(userId: string) {
    return [...this.db.requests.values()].filter((r) => r.requesterId === userId).map(clone);
  }
  async listRequestsForExpert(expertId: string) {
    return [...this.db.requests.values()].filter((r) => r.assignedExpertId === expertId).map(clone);
  }
  async listAllRequests(status?: RequestStatus) {
    return [...this.db.requests.values()].filter((r) => !status || r.status === status).map(clone);
  }
  async updateRequest(id: string, patch: Parameters<RescueStore["updateRequest"]>[1]) {
    const r = this.db.requests.get(id)!;
    Object.assign(r, patch);
    return clone(r);
  }
  async activeHandoff(requestId: string) {
    const h = [...this.db.handoffs.values()].find(
      (x) => x.serviceRequestId === requestId && x.status === "active",
    );
    return h ? clone(h) : null;
  }
  async listHandoffs(requestId: string) {
    return [...this.db.handoffs.values()]
      .filter((x) => x.serviceRequestId === requestId)
      .map(clone);
  }
  async createHandoff(i: Parameters<RescueStore["createHandoff"]>[0]) {
    if (await this.activeHandoff(i.serviceRequestId))
      throw new Error("An active handoff already exists");
    const h: HandoffRow = {
      id: uuid(),
      serviceRequestId: i.serviceRequestId,
      projectId: i.projectId,
      expertId: i.expertId,
      scopes: i.scopes,
      status: "active",
      grantedAt: i.now.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      revokedAt: null,
    };
    this.db.handoffs.set(h.id, h);
    return clone(h);
  }
  async revokeHandoffs(requestId: string, now: Date) {
    let n = 0;
    for (const h of this.db.handoffs.values())
      if (h.serviceRequestId === requestId && h.status === "active") {
        h.status = "revoked";
        h.revokedAt = now.toISOString();
        n++;
      }
    return n;
  }
  async listJobMilestones(requestId: string) {
    return [...this.db.jobs.values()]
      .filter((j) => j.serviceRequestId === requestId)
      .sort((a, b) => a.position - b.position)
      .map(clone);
  }
  async addJobMilestone(
    requestId: string,
    i: { title: string; description: string | null },
    now: Date,
  ) {
    const position = (await this.listJobMilestones(requestId)).length;
    const row: JobMilestoneRow = {
      id: uuid(),
      serviceRequestId: requestId,
      title: i.title,
      description: i.description,
      position,
      status: "todo",
      deliverableNote: null,
      deliverableUrl: null,
      submittedAt: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: now.toISOString(),
    };
    this.db.jobs.set(row.id, row);
    return clone(row);
  }
  async updateJobMilestone(id: string, patch: Parameters<RescueStore["updateJobMilestone"]>[1]) {
    const j = this.db.jobs.get(id)!;
    Object.assign(j, patch);
    return clone(j);
  }
}

import { MemoryOpsStore } from "./ops-memory-store";
export function createMemoryStores() {
  const db = new MemoryDb();
  return {
    db,
    progress: new MemoryProgressStore(db),
    projects: new MemoryProjectStore(db),
    github: new MemoryGitHubStore(db),
    scans: new MemoryScanStore(db),
    rescue: new MemoryRescueStore(db),
    publishing: new MemoryPublishingStore(db),
    ops: new MemoryOpsStore(db),
    profiles: db.profiles,
  } satisfies Stores & { db: MemoryDb };
}
