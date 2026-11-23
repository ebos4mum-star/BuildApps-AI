import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstallationInfo } from "@buildapps/github/types";
import type {
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

function fail(
  what: string,
  error: { message: string; code?: string } | null,
): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw PostgREST rows

const toInstall = (r: R): InstallationRow => ({
  id: r.id,
  userId: r.user_id,
  installationId: Number(r.installation_id),
  accountLogin: r.account_login,
  accountType: r.account_type,
  repositorySelection: r.repository_selection,
  createdAt: r.created_at,
});
const toScan = (r: R): ScanRow => ({
  id: r.id,
  projectId: r.project_id,
  requestedBy: r.requested_by,
  commitSha: r.commit_sha,
  ref: r.ref,
  status: r.status,
  stats: r.stats ?? {},
  assessment: r.assessment,
  error: r.error,
  createdAt: r.created_at,
  completedAt: r.completed_at,
});
const toFinding = (r: R): FindingRow => ({
  id: r.id,
  projectId: r.project_id,
  ruleId: r.rule_id,
  fingerprint: r.fingerprint,
  kind: r.kind,
  category: r.category,
  severity: r.severity,
  title: r.title,
  detail: r.detail,
  remedy: r.remedy ?? "",
  evidence: r.evidence ?? [],
  milestoneKey: r.milestone_key,
  status: r.status,
  statusNote: r.status_note,
  decidedByUser: r.decided_by_user,
  resolutionSource: r.resolution_source,
  firstSeenScan: r.first_seen_scan,
  lastSeenScan: r.last_seen_scan,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toRun = (r: R): VerificationRunRow => ({
  id: r.id,
  projectId: r.project_id,
  requestedBy: r.requested_by,
  commitSha: r.commit_sha,
  status: r.status,
  checks: r.checks ?? [],
  createdAt: r.created_at,
});
const toExpert = (r: R): ExpertRow => ({
  id: r.id,
  userId: r.user_id,
  displayName: r.display_name,
  headline: r.headline,
  bio: r.bio,
  skills: r.skills ?? [],
  status: r.status,
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  createdAt: r.created_at,
});
const toRequest = (r: R): ServiceRequestRow => ({
  id: r.id,
  projectId: r.project_id,
  requesterId: r.requester_id,
  summary: r.summary,
  status: r.status,
  assignedExpertId: r.assigned_expert_id,
  matchedAt: r.matched_at,
  completedAt: r.completed_at,
  completionEvidence: r.completion_evidence,
  createdAt: r.created_at,
});
const toHandoff = (r: R): HandoffRow => ({
  id: r.id,
  serviceRequestId: r.service_request_id,
  projectId: r.project_id,
  expertId: r.expert_id,
  scopes: r.scopes,
  status: r.status,
  grantedAt: r.granted_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
});
const toJob = (r: R): JobMilestoneRow => ({
  id: r.id,
  serviceRequestId: r.service_request_id,
  title: r.title,
  description: r.description,
  position: r.position,
  status: r.status,
  deliverableNote: r.deliverable_note,
  deliverableUrl: r.deliverable_url,
  submittedAt: r.submitted_at,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  createdAt: r.created_at,
});

export class SupabaseGitHubStore implements GitHubStore {
  constructor(private readonly db: SupabaseClient) {}
  async upsertInstallation(userId: string, i: InstallationInfo) {
    const { data, error } = await this.db
      .from("github_installations")
      .upsert(
        {
          user_id: userId,
          installation_id: i.installationId,
          account_login: i.accountLogin,
          account_type: i.accountType,
          repository_selection: i.repositorySelection,
        },
        { onConflict: "user_id,installation_id" },
      )
      .select()
      .single();
    fail("upsert installation", error);
    return toInstall(data);
  }
  async listInstallations(userId: string) {
    const { data, error } = await this.db
      .from("github_installations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    fail("list installations", error);
    return (data ?? []).map(toInstall);
  }
  async getInstallation(userId: string, rowId: string) {
    const { data, error } = await this.db
      .from("github_installations")
      .select("*")
      .eq("user_id", userId)
      .eq("id", rowId)
      .maybeSingle();
    fail("get installation", error);
    return data ? toInstall(data) : null;
  }
  async findByGithubId(installationId: number) {
    const { data, error } = await this.db
      .from("github_installations")
      .select("*")
      .eq("installation_id", installationId);
    fail("find installations", error);
    return (data ?? []).map(toInstall);
  }
  async deleteInstallation(userId: string, rowId: string) {
    const { error } = await this.db
      .from("github_installations")
      .delete()
      .eq("user_id", userId)
      .eq("id", rowId);
    fail("delete installation", error);
  }
  async deleteByGithubId(installationId: number) {
    const { error } = await this.db
      .from("github_installations")
      .delete()
      .eq("installation_id", installationId);
    fail("delete installations", error);
  }
}

export class SupabaseScanStore implements ScanStore {
  constructor(private readonly db: SupabaseClient) {}
  async createScan(i: { projectId: string; requestedBy: string; now: Date }) {
    const { data, error } = await this.db
      .from("scans")
      .insert({
        project_id: i.projectId,
        requested_by: i.requestedBy,
        status: "running",
        created_at: i.now.toISOString(),
      })
      .select()
      .single();
    fail("create scan", error);
    return toScan(data);
  }
  async completeScan(id: string, p: Parameters<ScanStore["completeScan"]>[1]) {
    const { error } = await this.db
      .from("scans")
      .update({
        status: "complete",
        commit_sha: p.commitSha,
        ref: p.ref,
        stats: p.stats,
        assessment: p.assessment,
        completed_at: p.now.toISOString(),
      })
      .eq("id", id);
    fail("complete scan", error);
  }
  async failScan(id: string, message: string, now: Date) {
    const { error } = await this.db
      .from("scans")
      .update({ status: "failed", error: message.slice(0, 500), completed_at: now.toISOString() })
      .eq("id", id);
    fail("fail scan", error);
  }
  async syncFindings(
    projectId: string,
    scanId: string,
    findings: Parameters<ScanStore["syncFindings"]>[2],
  ) {
    const { data, error } = await this.db.rpc("sync_findings", {
      p_project_id: projectId,
      p_scan_id: scanId,
      p_findings: findings.map((f) => ({
        rule_id: f.ruleId,
        fingerprint: f.fingerprint,
        kind: f.kind,
        category: f.category,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        remedy: f.remedy,
        evidence: f.evidence,
        milestone_key: f.milestoneKey,
      })),
    });
    fail("sync_findings", error);
    return {
      new: data.new as number,
      reopened: data.reopened as number,
      resolved: data.resolved as number,
    };
  }
  async listFindings(projectId: string) {
    const { data, error } = await this.db
      .from("project_findings")
      .select("*")
      .eq("project_id", projectId);
    fail("list findings", error);
    return (data ?? []).map(toFinding);
  }
  async getFinding(projectId: string, id: string) {
    const { data, error } = await this.db
      .from("project_findings")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .maybeSingle();
    fail("get finding", error);
    return data ? toFinding(data) : null;
  }
  async updateFinding(projectId: string, id: string, p: Parameters<ScanStore["updateFinding"]>[2]) {
    const { data, error } = await this.db
      .from("project_findings")
      .update({
        status: p.status,
        status_note: p.statusNote,
        decided_by_user: p.decidedByUser,
        resolution_source: p.resolutionSource,
        updated_at: p.now.toISOString(),
      })
      .eq("project_id", projectId)
      .eq("id", id)
      .select()
      .single();
    fail("update finding", error);
    return toFinding(data);
  }
  async latestScan(projectId: string) {
    const { data, error } = await this.db
      .from("scans")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1);
    fail("latest scan", error);
    return data?.[0] ? toScan(data[0]) : null;
  }
  async countScansSince(projectId: string, since: Date) {
    const { count, error } = await this.db
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("created_at", since.toISOString());
    fail("count scans", error);
    return count ?? 0;
  }
  async createVerificationRun(i: Parameters<ScanStore["createVerificationRun"]>[0]) {
    const { data, error } = await this.db
      .from("verification_runs")
      .insert({
        project_id: i.projectId,
        requested_by: i.requestedBy,
        commit_sha: i.commitSha,
        status: i.status,
        checks: i.checks,
        created_at: i.now.toISOString(),
      })
      .select()
      .single();
    fail("create verification run", error);
    return toRun(data);
  }
  async latestVerification(projectId: string) {
    const { data, error } = await this.db
      .from("verification_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);
    fail("latest verification", error);
    return data?.[0] ? toRun(data[0]) : null;
  }
}

export class SupabaseRescueStore implements RescueStore {
  constructor(private readonly db: SupabaseClient) {}
  async isAdmin(userId: string) {
    const { data, error } = await this.db
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    fail("is admin", error);
    return !!data;
  }
  async upsertExpertApplication(
    userId: string,
    i: { displayName: string; headline: string | null; bio: string | null; skills: string[] },
  ) {
    const cur = await this.getExpertByUser(userId);
    const fields = {
      display_name: i.displayName,
      headline: i.headline,
      bio: i.bio,
      skills: i.skills,
    };
    if (!cur) {
      const { data, error } = await this.db
        .from("expert_profiles")
        .insert({ user_id: userId, ...fields })
        .select()
        .single();
      fail("create expert", error);
      return toExpert(data);
    }
    const reapply =
      cur.status === "rejected"
        ? { status: "pending", reviewed_by: null, reviewed_at: null, review_note: null }
        : {};
    const { data, error } = await this.db
      .from("expert_profiles")
      .update({ ...fields, ...reapply })
      .eq("id", cur.id)
      .select()
      .single();
    fail("update expert", error);
    return toExpert(data);
  }
  async getExpertByUser(userId: string) {
    const { data, error } = await this.db
      .from("expert_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    fail("get expert", error);
    return data ? toExpert(data) : null;
  }
  async getExpert(id: string) {
    const { data, error } = await this.db
      .from("expert_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get expert", error);
    return data ? toExpert(data) : null;
  }
  async listExperts(status?: ExpertStatus) {
    let q = this.db.from("expert_profiles").select("*").order("created_at");
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    fail("list experts", error);
    return (data ?? []).map(toExpert);
  }
  async reviewExpert(
    id: string,
    adminId: string,
    status: ExpertStatus,
    note: string | null,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("expert_profiles")
      .update({ status, reviewed_by: adminId, reviewed_at: now.toISOString(), review_note: note })
      .eq("id", id)
      .select()
      .single();
    fail("review expert", error);
    return toExpert(data);
  }
  async getRequest(id: string) {
    const { data, error } = await this.db
      .from("service_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get request", error);
    return data ? toRequest(data) : null;
  }
  async listRequestsForRequester(userId: string) {
    const { data, error } = await this.db
      .from("service_requests")
      .select("*")
      .eq("requester_id", userId)
      .order("created_at", { ascending: false });
    fail("list requests", error);
    return (data ?? []).map(toRequest);
  }
  async listRequestsForExpert(expertId: string) {
    const { data, error } = await this.db
      .from("service_requests")
      .select("*")
      .eq("assigned_expert_id", expertId)
      .order("created_at", { ascending: false });
    fail("list expert requests", error);
    return (data ?? []).map(toRequest);
  }
  async listAllRequests(status?: RequestStatus) {
    let q = this.db.from("service_requests").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    fail("list all requests", error);
    return (data ?? []).map(toRequest);
  }
  async updateRequest(id: string, p: Parameters<RescueStore["updateRequest"]>[1]) {
    const row: R = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.assignedExpertId !== undefined) row.assigned_expert_id = p.assignedExpertId;
    if (p.matchedAt !== undefined) row.matched_at = p.matchedAt;
    if (p.completedAt !== undefined) row.completed_at = p.completedAt;
    if (p.completionEvidence !== undefined) row.completion_evidence = p.completionEvidence;
    const { data, error } = await this.db
      .from("service_requests")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    fail("update request", error);
    return toRequest(data);
  }
  async activeHandoff(requestId: string) {
    const { data, error } = await this.db
      .from("project_handoffs")
      .select("*")
      .eq("service_request_id", requestId)
      .eq("status", "active")
      .maybeSingle();
    fail("active handoff", error);
    return data ? toHandoff(data) : null;
  }
  async listHandoffs(requestId: string) {
    const { data, error } = await this.db
      .from("project_handoffs")
      .select("*")
      .eq("service_request_id", requestId)
      .order("granted_at");
    fail("list handoffs", error);
    return (data ?? []).map(toHandoff);
  }
  async createHandoff(i: Parameters<RescueStore["createHandoff"]>[0]) {
    const { data, error } = await this.db
      .from("project_handoffs")
      .insert({
        service_request_id: i.serviceRequestId,
        project_id: i.projectId,
        expert_id: i.expertId,
        scopes: i.scopes,
        granted_at: i.now.toISOString(),
        expires_at: i.expiresAt.toISOString(),
      })
      .select()
      .single();
    if (error?.code === "23505") throw new Error("An active handoff already exists");
    fail("create handoff", error);
    return toHandoff(data);
  }
  async revokeHandoffs(requestId: string, now: Date) {
    const { data, error } = await this.db
      .from("project_handoffs")
      .update({ status: "revoked", revoked_at: now.toISOString() })
      .eq("service_request_id", requestId)
      .eq("status", "active")
      .select("id");
    fail("revoke handoffs", error);
    return data?.length ?? 0;
  }
  async listJobMilestones(requestId: string) {
    const { data, error } = await this.db
      .from("job_milestones")
      .select("*")
      .eq("service_request_id", requestId)
      .order("position");
    fail("list job milestones", error);
    return (data ?? []).map(toJob);
  }
  async addJobMilestone(
    requestId: string,
    i: { title: string; description: string | null },
    now: Date,
  ) {
    const position = (await this.listJobMilestones(requestId)).length;
    const { data, error } = await this.db
      .from("job_milestones")
      .insert({
        service_request_id: requestId,
        title: i.title,
        description: i.description,
        position,
        created_at: now.toISOString(),
      })
      .select()
      .single();
    fail("add job milestone", error);
    return toJob(data);
  }
  async updateJobMilestone(id: string, p: Parameters<RescueStore["updateJobMilestone"]>[1]) {
    const row: R = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.deliverableNote !== undefined) row.deliverable_note = p.deliverableNote;
    if (p.deliverableUrl !== undefined) row.deliverable_url = p.deliverableUrl;
    if (p.submittedAt !== undefined) row.submitted_at = p.submittedAt;
    if (p.decidedAt !== undefined) row.decided_at = p.decidedAt;
    if (p.decisionNote !== undefined) row.decision_note = p.decisionNote;
    const { data, error } = await this.db
      .from("job_milestones")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    fail("update job milestone", error);
    return toJob(data);
  }
}
