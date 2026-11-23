import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionStatus, Claim, Platform, TargetMetadata } from "@buildapps/publishing";
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

function fail(
  what: string,
  error: { message: string; code?: string } | null,
): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw PostgREST rows

const toTarget = (r: R): PublishTargetRow => ({
  id: r.id,
  projectId: r.project_id,
  platform: r.platform,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toClaim = (r: R): ClaimRow => ({
  targetId: r.target_id,
  key: r.requirement_key,
  kind: r.kind,
  note: r.note,
  at: r.updated_at,
});
const toRelease = (r: R): ReleaseRow => ({
  id: r.id,
  targetId: r.target_id,
  version: r.version,
  buildNumber: r.build_number,
  notes: r.notes,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toSub = (r: R): SubmissionRow => ({
  id: r.id,
  releaseId: r.release_id,
  attemptNumber: r.attempt_number,
  status: r.status,
  storeReference: r.store_reference,
  submittedAt: r.submitted_at,
  decidedAt: r.decided_at,
});
const toFeedback = (r: R): FeedbackRow => ({
  id: r.id,
  submissionId: r.submission_id,
  outcome: r.outcome,
  reasonCategory: r.reason_category,
  guidelineRef: r.guideline_ref,
  message: r.message,
  createdAt: r.created_at,
});
const toAction = (r: R): ActionRow => ({
  id: r.id,
  releaseId: r.release_id,
  feedbackId: r.feedback_id,
  title: r.title,
  detail: r.detail,
  requirementKey: r.requirement_key,
  findingId: r.finding_id,
  status: r.status,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  doneAt: r.done_at,
});
const toEvent = (r: R): PublishEventRow => ({
  id: String(r.id),
  projectId: r.project_id,
  targetId: r.target_id,
  releaseId: r.release_id,
  actorId: r.actor_id,
  actorRole: r.actor_role,
  action: r.action,
  detail: r.detail ?? {},
  createdAt: r.created_at,
});

export class SupabasePublishingStore implements PublishingStore {
  constructor(private readonly db: SupabaseClient) {}
  async listTargets(projectId: string) {
    const { data, error } = await this.db
      .from("publish_targets")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    fail("list targets", error);
    return (data ?? []).map(toTarget);
  }
  async getTarget(id: string) {
    const { data, error } = await this.db
      .from("publish_targets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get target", error);
    return data ? toTarget(data) : null;
  }
  async createTarget(projectId: string, platform: Platform, now: Date) {
    const { data, error } = await this.db
      .from("publish_targets")
      .upsert(
        {
          project_id: projectId,
          platform,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "project_id,platform", ignoreDuplicates: true },
      )
      .select();
    fail("create target", error);
    if (data && data[0]) return toTarget(data[0]);
    const { data: existing, error: e2 } = await this.db
      .from("publish_targets")
      .select("*")
      .eq("project_id", projectId)
      .eq("platform", platform)
      .single();
    fail("load target", e2);
    return toTarget(existing);
  }
  async updateMetadata(id: string, metadata: TargetMetadata, now: Date) {
    const { data, error } = await this.db
      .from("publish_targets")
      .update({ metadata, updated_at: now.toISOString() })
      .eq("id", id)
      .select()
      .single();
    fail("update metadata", error);
    return toTarget(data);
  }
  async listClaims(targetId: string) {
    const { data, error } = await this.db
      .from("publish_claims")
      .select("*")
      .eq("target_id", targetId);
    fail("list claims", error);
    return (data ?? []).map(toClaim);
  }
  async upsertClaim(targetId: string, key: string, claim: Claim) {
    const { error } = await this.db.from("publish_claims").upsert(
      {
        target_id: targetId,
        requirement_key: key,
        kind: claim.kind,
        note: claim.note,
        updated_at: claim.at,
      },
      { onConflict: "target_id,requirement_key" },
    );
    fail("upsert claim", error);
  }
  async deleteClaim(targetId: string, key: string) {
    const { error } = await this.db
      .from("publish_claims")
      .delete()
      .eq("target_id", targetId)
      .eq("requirement_key", key);
    fail("delete claim", error);
  }
  async listReleases(targetId: string) {
    const { data, error } = await this.db
      .from("publish_releases")
      .select("*")
      .eq("target_id", targetId)
      .order("created_at");
    fail("list releases", error);
    return (data ?? []).map(toRelease);
  }
  async getRelease(id: string) {
    const { data, error } = await this.db
      .from("publish_releases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get release", error);
    return data ? toRelease(data) : null;
  }
  async createRelease(
    targetId: string,
    i: { version: string; buildNumber: string | null; notes: string | null },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("publish_releases")
      .insert({
        target_id: targetId,
        version: i.version,
        build_number: i.buildNumber,
        notes: i.notes,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    if (error?.code === "23505")
      throw new DuplicateError("That version already exists for this target");
    fail("create release", error);
    return toRelease(data);
  }
  async updateRelease(
    id: string,
    patch: Partial<Pick<ReleaseRow, "status" | "notes" | "buildNumber">>,
    now: Date,
  ) {
    const row: R = { updated_at: now.toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.buildNumber !== undefined) row.build_number = patch.buildNumber;
    const { data, error } = await this.db
      .from("publish_releases")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    fail("update release", error);
    return toRelease(data);
  }
  async listSubmissions(releaseId: string) {
    const { data, error } = await this.db
      .from("publish_submissions")
      .select("*")
      .eq("release_id", releaseId)
      .order("attempt_number");
    fail("list submissions", error);
    return (data ?? []).map(toSub);
  }
  async createSubmission(
    releaseId: string,
    attemptNumber: number,
    storeReference: string | null,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("publish_submissions")
      .insert({
        release_id: releaseId,
        attempt_number: attemptNumber,
        store_reference: storeReference,
        submitted_at: now.toISOString(),
      })
      .select()
      .single();
    if (error?.code === "23505")
      throw new DuplicateError("An active submission or this attempt already exists");
    fail("create submission", error);
    return toSub(data);
  }
  async updateSubmission(id: string, patch: Partial<Pick<SubmissionRow, "status" | "decidedAt">>) {
    const row: R = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.decidedAt !== undefined) row.decided_at = patch.decidedAt;
    const { data, error } = await this.db
      .from("publish_submissions")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    fail("update submission", error);
    return toSub(data);
  }
  async listFeedback(releaseId: string) {
    const subs = await this.listSubmissions(releaseId);
    if (subs.length === 0) return [];
    const { data, error } = await this.db
      .from("publish_feedback")
      .select("*")
      .in(
        "submission_id",
        subs.map((s) => s.id),
      )
      .order("created_at");
    fail("list feedback", error);
    return (data ?? []).map(toFeedback);
  }
  async addFeedback(
    submissionId: string,
    i: Omit<FeedbackRow, "id" | "submissionId" | "createdAt">,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("publish_feedback")
      .insert({
        submission_id: submissionId,
        outcome: i.outcome,
        reason_category: i.reasonCategory,
        guideline_ref: i.guidelineRef,
        message: i.message,
        created_at: now.toISOString(),
      })
      .select()
      .single();
    fail("add feedback", error);
    return toFeedback(data);
  }
  async listActions(releaseId: string) {
    const { data, error } = await this.db
      .from("publish_actions")
      .select("*")
      .eq("release_id", releaseId)
      .order("created_at");
    fail("list actions", error);
    return (data ?? []).map(toAction);
  }
  async getAction(id: string) {
    const { data, error } = await this.db
      .from("publish_actions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get action", error);
    return data ? toAction(data) : null;
  }
  async addAction(
    releaseId: string,
    i: Pick<ActionRow, "feedbackId" | "title" | "detail" | "requirementKey" | "findingId">,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("publish_actions")
      .insert({
        release_id: releaseId,
        feedback_id: i.feedbackId,
        title: i.title,
        detail: i.detail,
        requirement_key: i.requirementKey,
        finding_id: i.findingId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    fail("add action", error);
    return toAction(data);
  }
  async updateAction(
    id: string,
    patch: { status: ActionStatus; note: string | null; doneAt: string | null },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("publish_actions")
      .update({
        status: patch.status,
        note: patch.note,
        done_at: patch.doneAt,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    fail("update action", error);
    return toAction(data);
  }
  async addEvent(e: Omit<PublishEventRow, "id" | "createdAt">, now: Date) {
    const { error } = await this.db.from("publish_events").insert({
      project_id: e.projectId,
      target_id: e.targetId,
      release_id: e.releaseId,
      actor_id: e.actorId,
      actor_role: e.actorRole,
      action: e.action,
      detail: e.detail,
      created_at: now.toISOString(),
    });
    fail("add publish event", error);
  }
  async listEvents(projectId: string, limit: number) {
    const { data, error } = await this.db
      .from("publish_events")
      .select("*")
      .eq("project_id", projectId)
      .order("id", { ascending: false })
      .limit(limit);
    fail("list publish events", error);
    return (data ?? []).map(toEvent).reverse();
  }
}
