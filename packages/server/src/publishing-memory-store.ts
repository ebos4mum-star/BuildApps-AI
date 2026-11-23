import {
  canTransition,
  type ActionStatus,
  type Claim,
  type Platform,
  type TargetMetadata,
} from "@buildapps/publishing";
import {
  DuplicateError,
  type ActionRow,
  type ClaimRow,
  type FeedbackRow,
  type PublishEventRow,
  type PublishTargetRow,
  type PublishingStore,
  type ReleaseRow,
  type SubmissionRow,
} from "./publishing-types";
import type { MemoryDb } from "./memory-store";

const uuid = () => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

/** Same integrity rules as the SQL: unique version, one active submission, guarded release transitions. */
export class MemoryPublishingStore implements PublishingStore {
  constructor(private readonly db: MemoryDb) {}
  async listTargets(projectId: string) {
    return [...this.db.pubTargets.values()].filter((t) => t.projectId === projectId).map(clone);
  }
  async getTarget(id: string) {
    const t = this.db.pubTargets.get(id);
    return t ? clone(t) : null;
  }
  async createTarget(projectId: string, platform: Platform, now: Date) {
    const existing = [...this.db.pubTargets.values()].find(
      (t) => t.projectId === projectId && t.platform === platform,
    );
    if (existing) return clone(existing);
    const row: PublishTargetRow = {
      id: uuid(),
      projectId,
      platform,
      metadata: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.db.pubTargets.set(row.id, row);
    return clone(row);
  }
  async updateMetadata(id: string, metadata: TargetMetadata, now: Date) {
    const t = this.db.pubTargets.get(id)!;
    t.metadata = clone(metadata);
    t.updatedAt = now.toISOString();
    return clone(t);
  }
  async listClaims(targetId: string) {
    return [...this.db.pubClaims.values()].filter((c) => c.targetId === targetId).map(clone);
  }
  async upsertClaim(targetId: string, key: string, claim: Claim) {
    this.db.pubClaims.set(`${targetId}:${key}`, { targetId, key, ...claim });
  }
  async deleteClaim(targetId: string, key: string) {
    this.db.pubClaims.delete(`${targetId}:${key}`);
  }
  async listReleases(targetId: string) {
    return [...this.db.pubReleases.values()].filter((r) => r.targetId === targetId).map(clone);
  }
  async getRelease(id: string) {
    const r = this.db.pubReleases.get(id);
    return r ? clone(r) : null;
  }
  async createRelease(
    targetId: string,
    i: { version: string; buildNumber: string | null; notes: string | null },
    now: Date,
  ) {
    if (
      [...this.db.pubReleases.values()].some(
        (r) => r.targetId === targetId && r.version === i.version,
      )
    )
      throw new DuplicateError("That version already exists for this target");
    const row: ReleaseRow = {
      id: uuid(),
      targetId,
      version: i.version,
      buildNumber: i.buildNumber,
      notes: i.notes,
      status: "draft",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.db.pubReleases.set(row.id, row);
    return clone(row);
  }
  async updateRelease(
    id: string,
    patch: Partial<Pick<ReleaseRow, "status" | "notes" | "buildNumber">>,
    now: Date,
  ) {
    const r = this.db.pubReleases.get(id)!;
    if (patch.status && patch.status !== r.status) {
      if (!canTransition(r.status, patch.status))
        throw new Error(`illegal release transition ${r.status} -> ${patch.status}`);
      // mirrors the deferred SQL constraint: a submitted/decided release must have a recorded submission
      if (
        ["submitted", "in_review", "rejected", "approved", "released"].includes(patch.status) &&
        ![...this.db.pubSubmissions.values()].some((s) => s.releaseId === id)
      )
        throw new Error(`release ${id} has no recorded submission`);
    }
    Object.assign(r, patch, { updatedAt: now.toISOString() });
    return clone(r);
  }
  async listSubmissions(releaseId: string) {
    return [...this.db.pubSubmissions.values()]
      .filter((s) => s.releaseId === releaseId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map(clone);
  }
  async createSubmission(
    releaseId: string,
    attemptNumber: number,
    storeReference: string | null,
    now: Date,
  ) {
    const all = [...this.db.pubSubmissions.values()].filter((s) => s.releaseId === releaseId);
    if (all.some((s) => s.attemptNumber === attemptNumber))
      throw new DuplicateError("That attempt number already exists");
    if (all.some((s) => s.status === "submitted" || s.status === "in_review"))
      throw new DuplicateError("An active submission already exists for this release");
    const row: SubmissionRow = {
      id: uuid(),
      releaseId,
      attemptNumber,
      status: "submitted",
      storeReference,
      submittedAt: now.toISOString(),
      decidedAt: null,
    };
    this.db.pubSubmissions.set(row.id, row);
    return clone(row);
  }
  async updateSubmission(id: string, patch: Partial<Pick<SubmissionRow, "status" | "decidedAt">>) {
    const s = this.db.pubSubmissions.get(id)!;
    Object.assign(s, patch);
    return clone(s);
  }
  async listFeedback(releaseId: string) {
    const subs = new Set((await this.listSubmissions(releaseId)).map((s) => s.id));
    return [...this.db.pubFeedback.values()].filter((f) => subs.has(f.submissionId)).map(clone);
  }
  async addFeedback(
    submissionId: string,
    i: Omit<FeedbackRow, "id" | "submissionId" | "createdAt">,
    now: Date,
  ) {
    const row: FeedbackRow = { id: uuid(), submissionId, createdAt: now.toISOString(), ...i };
    this.db.pubFeedback.set(row.id, row);
    return clone(row);
  }
  async listActions(releaseId: string) {
    return [...this.db.pubActions.values()].filter((a) => a.releaseId === releaseId).map(clone);
  }
  async getAction(id: string) {
    const a = this.db.pubActions.get(id);
    return a ? clone(a) : null;
  }
  async addAction(
    releaseId: string,
    i: Pick<ActionRow, "feedbackId" | "title" | "detail" | "requirementKey" | "findingId">,
    now: Date,
  ) {
    const row: ActionRow = {
      id: uuid(),
      releaseId,
      ...i,
      status: "open",
      note: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      doneAt: null,
    };
    this.db.pubActions.set(row.id, row);
    return clone(row);
  }
  async updateAction(
    id: string,
    patch: { status: ActionStatus; note: string | null; doneAt: string | null },
    now: Date,
  ) {
    const a = this.db.pubActions.get(id)!;
    Object.assign(a, patch, { updatedAt: now.toISOString() });
    return clone(a);
  }
  async addEvent(e: Omit<PublishEventRow, "id" | "createdAt">, now: Date) {
    this.db.pubEvents.push({
      id: String(this.db.pubEvents.length + 1),
      createdAt: now.toISOString(),
      ...e,
    });
  }
  async listEvents(projectId: string, limit: number) {
    return this.db.pubEvents
      .filter((e) => e.projectId === projectId)
      .slice(-limit)
      .map(clone);
  }
}
export type { ClaimRow };
