import { z } from "zod";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import { buildPublishingView, type PublishingView } from "./publishing-service";
import {
  HANDOFF_SCOPES,
  type EventRole,
  type RequestEventRow,
  type ExpertRow,
  type ExpertStatus,
  type FindingRow,
  type HandoffRow,
  type HandoffScope,
  type JobMilestoneRow,
  type RequestStatus,
  type ScanRow,
  type ServiceRequestRow,
  type VerificationRunRow,
} from "./batch2-types";
import type { Project } from "@buildapps/core";

export const MAX_HANDOFF_DAYS = 30;
const DAY = 86_400_000;

const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new WorkspaceError("invalid", r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
};

/** What a project owner may see of an expert (no contact details). */
export const publicExpert = (e: ExpertRow) => ({
  id: e.id,
  displayName: e.displayName,
  headline: e.headline,
  skills: e.skills,
});

// ---------- experts & admin ----------
const applySchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  headline: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export async function applyAsExpert(d: Deps, userId: string, input: unknown): Promise<ExpertRow> {
  const v = parse(applySchema, input);
  return d.stores.rescue.upsertExpertApplication(userId, {
    displayName: v.displayName,
    headline: v.headline ?? null,
    bio: v.bio ?? null,
    skills: v.skills,
  });
}
export const getMyExpertProfile = (d: Deps, userId: string) =>
  d.stores.rescue.getExpertByUser(userId);

export async function requireAdmin(d: Deps, userId: string): Promise<void> {
  if (!(await d.stores.rescue.isAdmin(userId)))
    throw new WorkspaceError("forbidden", "Administrators only");
}
export async function adminListExperts(d: Deps, adminId: string, status?: ExpertStatus) {
  await requireAdmin(d, adminId);
  return d.stores.rescue.listExperts(status);
}
export async function adminReviewExpert(
  d: Deps,
  adminId: string,
  expertId: string,
  input: unknown,
): Promise<ExpertRow> {
  await requireAdmin(d, adminId);
  const v = parse(
    z.object({
      decision: z.enum(["approved", "rejected", "suspended"]),
      note: z.string().trim().max(1000).optional(),
    }),
    input,
  );
  const e = await d.stores.rescue.getExpert(expertId);
  if (!e) throw new WorkspaceError("not_found", "Expert not found");
  if (e.userId === adminId)
    throw new WorkspaceError("forbidden", "Administrators cannot review their own expert profile");
  const updated = await d.stores.rescue.reviewExpert(
    expertId,
    adminId,
    v.decision,
    v.note ?? null,
    nowOf(d),
  );
  if (v.decision !== "approved") await revokeForExpert(d, expertId); // access ends the moment an expert is not in good standing
  return updated;
}
async function revokeForExpert(d: Deps, expertId: string) {
  for (const r of await d.stores.rescue.listRequestsForExpert(expertId)) {
    if ((await d.stores.rescue.revokeHandoffs(r.id, nowOf(d))) > 0)
      await log(d, r.id, null, "system", "handoff_revoked", {
        reason: "expert no longer approved",
      });
  }
}
export async function adminListRequests(d: Deps, adminId: string, status?: RequestStatus) {
  await requireAdmin(d, adminId);
  return d.stores.rescue.listAllRequests(status);
}
/** Manual matching: an administrator assigns an APPROVED expert to a submitted request. */
async function adminMatchImpl(
  d: Deps,
  adminId: string,
  requestId: string,
  expertId: string,
): Promise<ServiceRequestRow> {
  await requireAdmin(d, adminId);
  const [r, e] = await Promise.all([
    d.stores.rescue.getRequest(requestId),
    d.stores.rescue.getExpert(expertId),
  ]);
  if (!r || !e) throw new WorkspaceError("not_found", "Request or expert not found");
  if (e.status !== "approved")
    throw new WorkspaceError("conflict", "Only approved experts can be matched");
  if (e.userId === r.requesterId)
    throw new WorkspaceError("conflict", "An expert cannot work on their own project");
  if (r.status !== "submitted")
    throw new WorkspaceError("conflict", `Request is ${r.status}, not awaiting a match`);
  return d.stores.rescue.updateRequest(requestId, {
    status: "matched",
    assignedExpertId: expertId,
    matchedAt: nowOf(d).toISOString(),
  });
}

// ---------- shared loaders ----------
async function ownRequest(d: Deps, userId: string, requestId: string): Promise<ServiceRequestRow> {
  const r = await d.stores.rescue.getRequest(requestId);
  if (!r || r.requesterId !== userId) throw new WorkspaceError("not_found", "Request not found");
  return r;
}
async function assignedRequest(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<{ r: ServiceRequestRow; expert: ExpertRow }> {
  const expert = await d.stores.rescue.getExpertByUser(userId);
  const r = await d.stores.rescue.getRequest(requestId);
  if (!expert || expert.status !== "approved" || !r || r.assignedExpertId !== expert.id)
    throw new WorkspaceError("not_found", "Request not found");
  return { r, expert };
}

// ---------- owner ----------
export interface RequestView {
  request: ServiceRequestRow;
  expert: ReturnType<typeof publicExpert> | null;
  jobs: JobMilestoneRow[];
  handoff: HandoffRow | null;
  events: RequestEventRow[];
}
async function view(d: Deps, r: ServiceRequestRow): Promise<RequestView> {
  const [e, jobs, ho, events] = await Promise.all([
    r.assignedExpertId ? d.stores.rescue.getExpert(r.assignedExpertId) : null,
    d.stores.rescue.listJobMilestones(r.id),
    d.stores.rescue.activeHandoff(r.id),
    d.stores.rescue.listEvents(r.id),
  ]);
  const live = ho && new Date(ho.expiresAt) > nowOf(d) ? ho : null;
  return { request: r, expert: e ? publicExpert(e) : null, jobs, handoff: live, events };
}
export async function listMyRequests(d: Deps, userId: string): Promise<RequestView[]> {
  return Promise.all(
    (await d.stores.rescue.listRequestsForRequester(userId)).map((r) => view(d, r)),
  );
}
export async function getMyRequest(d: Deps, userId: string, requestId: string) {
  return view(d, await ownRequest(d, userId, requestId));
}

async function grantHandoffImpl(
  d: Deps,
  userId: string,
  requestId: string,
  input: unknown,
): Promise<HandoffRow> {
  const v = parse(
    z.object({
      scopes: z.array(z.enum(HANDOFF_SCOPES)).min(1),
      days: z.number().int().min(1).max(MAX_HANDOFF_DAYS).default(7),
    }),
    input,
  );
  const r = await ownRequest(d, userId, requestId);
  if (!r.assignedExpertId || (r.status !== "matched" && r.status !== "in_progress"))
    throw new WorkspaceError(
      "conflict",
      "A handoff can only be granted to the matched expert while the job is open",
    );
  const e = await d.stores.rescue.getExpert(r.assignedExpertId);
  if (!e || e.status !== "approved")
    throw new WorkspaceError("conflict", "The matched expert is not currently approved");
  const now = nowOf(d);
  try {
    return await d.stores.rescue.createHandoff({
      serviceRequestId: r.id,
      projectId: r.projectId,
      expertId: e.id,
      scopes: [...new Set(v.scopes)] as HandoffScope[],
      now,
      expiresAt: new Date(now.getTime() + v.days * DAY),
    });
  } catch (err) {
    throw new WorkspaceError(
      "conflict",
      err instanceof Error ? err.message : "Could not grant handoff",
    );
  }
}
async function revokeHandoffImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<{ revoked: number }> {
  const r = await ownRequest(d, userId, requestId);
  return { revoked: await d.stores.rescue.revokeHandoffs(r.id, nowOf(d)) };
}

async function decideJobMilestoneImpl(
  d: Deps,
  userId: string,
  requestId: string,
  jobId: string,
  input: unknown,
): Promise<JobMilestoneRow> {
  const v = parse(
    z.object({
      decision: z.enum(["accept", "reject"]),
      note: z.string().trim().max(1000).optional(),
    }),
    input,
  );
  const r = await ownRequest(d, userId, requestId);
  const job = (await d.stores.rescue.listJobMilestones(r.id)).find((j) => j.id === jobId);
  if (!job) throw new WorkspaceError("not_found", "Job milestone not found");
  if (job.status !== "submitted")
    throw new WorkspaceError("conflict", "Only submitted deliverables can be accepted or rejected");
  if (v.decision === "reject" && !v.note)
    throw new WorkspaceError("invalid", "Say what needs to change");
  const updated = await d.stores.rescue.updateJobMilestone(jobId, {
    status: v.decision === "accept" ? "accepted" : "rejected",
    decidedAt: nowOf(d).toISOString(),
    decisionNote: v.note ?? null,
  });
  // a rejected deliverable means the work is not delivered after all: let the expert resubmit
  if (v.decision === "reject" && r.status === "delivered")
    await d.stores.rescue.updateRequest(r.id, { status: "in_progress" });
  return updated;
}

/** Completion requires the OWNER to accept every job milestone; the evidence links to the latest scan/verification. */
async function completeRequestImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ServiceRequestRow> {
  const r = await ownRequest(d, userId, requestId);
  if (r.status !== "delivered")
    throw new WorkspaceError("conflict", "The expert has not marked the work as delivered");
  const jobs = await d.stores.rescue.listJobMilestones(r.id);
  if (jobs.length === 0 || jobs.some((j) => j.status !== "accepted"))
    throw new WorkspaceError("conflict", "Every job milestone must be accepted first");
  const [scan, run] = await Promise.all([
    d.stores.scans.latestScan(r.projectId),
    d.stores.scans.latestVerification(r.projectId),
  ]);
  await d.stores.rescue.revokeHandoffs(r.id, nowOf(d));
  return d.stores.rescue.updateRequest(r.id, {
    status: "completed",
    completedAt: nowOf(d).toISOString(),
    completionEvidence: {
      acceptedMilestones: jobs.length,
      latestScanId: scan?.id ?? null,
      latestVerificationId: run?.id ?? null,
      note: "Completion is owner-accepted; scan/verification ids show the project's evidence at that time.",
    },
  });
}
async function cancelRequestImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ServiceRequestRow> {
  const r = await ownRequest(d, userId, requestId);
  if (!["submitted", "matched", "in_progress"].includes(r.status))
    throw new WorkspaceError("conflict", `A ${r.status} request cannot be cancelled`);
  await d.stores.rescue.revokeHandoffs(r.id, nowOf(d));
  return d.stores.rescue.updateRequest(r.id, { status: "cancelled" });
}

// ---------- expert ----------
export async function expertListRequests(d: Deps, userId: string): Promise<ServiceRequestRow[]> {
  const e = await d.stores.rescue.getExpertByUser(userId);
  return e && e.status === "approved" ? d.stores.rescue.listRequestsForExpert(e.id) : [];
}
async function expertAcceptImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ServiceRequestRow> {
  const { r } = await assignedRequest(d, userId, requestId);
  if (r.status !== "matched") throw new WorkspaceError("conflict", `Request is ${r.status}`);
  return d.stores.rescue.updateRequest(r.id, { status: "in_progress" });
}
async function expertDeclineImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ServiceRequestRow> {
  const { r } = await assignedRequest(d, userId, requestId);
  if (r.status !== "matched")
    throw new WorkspaceError("conflict", "Only a matched, not-yet-accepted job can be declined");
  await d.stores.rescue.revokeHandoffs(r.id, nowOf(d));
  return d.stores.rescue.updateRequest(r.id, {
    status: "submitted",
    assignedExpertId: null,
    matchedAt: null,
  });
}
async function expertAddJobMilestoneImpl(
  d: Deps,
  userId: string,
  requestId: string,
  input: unknown,
): Promise<JobMilestoneRow> {
  const v = parse(
    z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional(),
    }),
    input,
  );
  const { r } = await assignedRequest(d, userId, requestId);
  if (r.status !== "matched" && r.status !== "in_progress")
    throw new WorkspaceError("conflict", "Milestones can only be added while the job is open");
  return d.stores.rescue.addJobMilestone(
    r.id,
    { title: v.title, description: v.description ?? null },
    nowOf(d),
  );
}
async function expertSubmitJobMilestoneImpl(
  d: Deps,
  userId: string,
  requestId: string,
  jobId: string,
  input: unknown,
): Promise<JobMilestoneRow> {
  const v = parse(
    z.object({
      note: z.string().trim().min(5).max(2000),
      url: z
        .string()
        .trim()
        .url()
        .regex(/^https:\/\//, "Deliverable links must use https")
        .max(500)
        .optional(),
    }),
    input,
  );
  const { r } = await assignedRequest(d, userId, requestId);
  if (r.status !== "in_progress")
    throw new WorkspaceError("conflict", "Accept the job before submitting work");
  const job = (await d.stores.rescue.listJobMilestones(r.id)).find((j) => j.id === jobId);
  if (!job) throw new WorkspaceError("not_found", "Job milestone not found");
  if (job.status === "accepted" || job.status === "submitted")
    throw new WorkspaceError("conflict", `Milestone is already ${job.status}`);
  return d.stores.rescue.updateJobMilestone(jobId, {
    status: "submitted",
    deliverableNote: v.note,
    deliverableUrl: v.url ?? null,
    submittedAt: nowOf(d).toISOString(),
    decidedAt: null,
    decisionNote: null,
  });
}
async function expertMarkDeliveredImpl(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ServiceRequestRow> {
  const { r } = await assignedRequest(d, userId, requestId);
  if (r.status !== "in_progress") throw new WorkspaceError("conflict", "Job is not in progress");
  const jobs = await d.stores.rescue.listJobMilestones(r.id);
  if (jobs.length === 0 || jobs.some((j) => j.status !== "submitted" && j.status !== "accepted"))
    throw new WorkspaceError(
      "conflict",
      "Submit every job milestone before marking the work delivered",
    );
  return d.stores.rescue.updateRequest(r.id, { status: "delivered" });
}

export interface ExpertWorkspaceView {
  request: ServiceRequestRow;
  handoff: HandoffRow;
  project?: {
    name: string;
    journey: Project["journey"];
    state: Project["state"];
    repo: string | null;
    milestones: Project["milestones"];
  };
  scan?: ScanRow | null;
  findings?: FindingRow[];
  verification?: VerificationRunRow | null;
  /** Release readiness + history (view_publishing). Never includes store credentials: none are collected. */
  publishing?: PublishingView;
  jobs: JobMilestoneRow[];
}
/**
 * What the expert can see is exactly what the owner granted, only while the handoff is active and
 * unexpired and the expert is approved. No source code or credentials are ever exposed here.
 */
export async function expertWorkspace(
  d: Deps,
  userId: string,
  requestId: string,
): Promise<ExpertWorkspaceView> {
  const { r } = await assignedRequest(d, userId, requestId);
  const ho = await d.stores.rescue.activeHandoff(r.id);
  if (!ho || new Date(ho.expiresAt) <= nowOf(d))
    throw new WorkspaceError(
      "forbidden",
      "The project owner has not granted (or has revoked) access, or it has expired",
    );
  const can = (s: HandoffScope) => ho.scopes.includes(s);
  const out: ExpertWorkspaceView = {
    request: r,
    handoff: ho,
    jobs: await d.stores.rescue.listJobMilestones(r.id),
  };
  if (can("view_project")) {
    const p = await d.stores.projects.get(r.requesterId, r.projectId);
    if (p)
      out.project = {
        name: p.name,
        journey: p.journey,
        state: p.state,
        repo: p.repo ? `${p.repo.owner}/${p.repo.name}` : null,
        milestones: p.milestones,
      };
  }
  if (can("view_scans")) out.scan = await d.stores.scans.latestScan(r.projectId);
  if (can("view_findings")) out.findings = await d.stores.scans.listFindings(r.projectId);
  if (can("view_verification"))
    out.verification = await d.stores.scans.latestVerification(r.projectId);
  if (can("view_publishing"))
    out.publishing = await buildPublishingView(d, r.requesterId, r.projectId);
  return out;
}

/** What an assigned expert may see BEFORE (or without) a handoff: the request, job milestones and handoff status only. */
export async function expertGetRequest(d: Deps, userId: string, requestId: string) {
  const { r } = await assignedRequest(d, userId, requestId);
  const [jobs, ho, events] = await Promise.all([
    d.stores.rescue.listJobMilestones(r.id),
    d.stores.rescue.activeHandoff(r.id),
    d.stores.rescue.listEvents(r.id),
  ]);
  return {
    request: r,
    jobs,
    handoff: ho && new Date(ho.expiresAt) > nowOf(d) ? ho : null,
    events,
  };
}

// ---------- activity trail ----------
/** Append-only job history (owner, expert, admin and system actions). */
async function log(
  d: Deps,
  requestId: string,
  actorId: string | null,
  role: EventRole,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await d.stores.rescue.addEvent(requestId, actorId, role, action, detail, nowOf(d));
}
async function hadHandoff(d: Deps, requestId: string) {
  return (await d.stores.rescue.activeHandoff(requestId)) !== null;
}

export async function adminMatch(d: Deps, adminId: string, requestId: string, expertId: string) {
  const r = await adminMatchImpl(d, adminId, requestId, expertId);
  const e = await d.stores.rescue.getExpert(expertId);
  await log(d, requestId, adminId, "admin", "matched", { expert: e?.displayName ?? expertId });
  return r;
}
export async function grantHandoff(d: Deps, userId: string, requestId: string, input: unknown) {
  const h = await grantHandoffImpl(d, userId, requestId, input);
  await log(d, requestId, userId, "owner", "handoff_granted", {
    scopes: h.scopes,
    expiresAt: h.expiresAt,
  });
  return h;
}
export async function revokeHandoff(d: Deps, userId: string, requestId: string) {
  const out = await revokeHandoffImpl(d, userId, requestId);
  if (out.revoked > 0)
    await log(d, requestId, userId, "owner", "handoff_revoked", { reason: "owner revoked" });
  return out;
}
export async function decideJobMilestone(
  d: Deps,
  userId: string,
  requestId: string,
  jobId: string,
  input: unknown,
) {
  const j = await decideJobMilestoneImpl(d, userId, requestId, jobId, input);
  await log(
    d,
    requestId,
    userId,
    "owner",
    j.status === "accepted" ? "milestone_accepted" : "revision_requested",
    { milestone: j.title, note: j.decisionNote },
  );
  return j;
}
export async function completeRequest(d: Deps, userId: string, requestId: string) {
  const had = await hadHandoff(d, requestId);
  const r = await completeRequestImpl(d, userId, requestId);
  if (had) await log(d, requestId, null, "system", "handoff_revoked", { reason: "job completed" });
  await log(d, requestId, userId, "owner", "completed", { evidence: r.completionEvidence });
  return r;
}
export async function cancelRequest(d: Deps, userId: string, requestId: string) {
  const had = await hadHandoff(d, requestId);
  const r = await cancelRequestImpl(d, userId, requestId);
  if (had)
    await log(d, requestId, null, "system", "handoff_revoked", { reason: "request cancelled" });
  await log(d, requestId, userId, "owner", "cancelled");
  return r;
}
export async function expertAccept(d: Deps, userId: string, requestId: string) {
  const r = await expertAcceptImpl(d, userId, requestId);
  await log(d, requestId, userId, "expert", "accepted");
  return r;
}
export async function expertDecline(d: Deps, userId: string, requestId: string) {
  const had = await hadHandoff(d, requestId);
  const r = await expertDeclineImpl(d, userId, requestId);
  if (had)
    await log(d, requestId, null, "system", "handoff_revoked", { reason: "expert declined" });
  await log(d, requestId, userId, "expert", "declined");
  return r;
}
export async function expertAddJobMilestone(
  d: Deps,
  userId: string,
  requestId: string,
  input: unknown,
) {
  const j = await expertAddJobMilestoneImpl(d, userId, requestId, input);
  await log(d, requestId, userId, "expert", "milestone_added", { milestone: j.title });
  return j;
}
export async function expertSubmitJobMilestone(
  d: Deps,
  userId: string,
  requestId: string,
  jobId: string,
  input: unknown,
) {
  const j = await expertSubmitJobMilestoneImpl(d, userId, requestId, jobId, input);
  await log(d, requestId, userId, "expert", "milestone_submitted", {
    milestone: j.title,
    deliverableUrl: j.deliverableUrl,
  });
  return j;
}
export async function expertMarkDelivered(d: Deps, userId: string, requestId: string) {
  const r = await expertMarkDeliveredImpl(d, userId, requestId);
  await log(d, requestId, userId, "expert", "delivered");
  return r;
}
