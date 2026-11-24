import type { Answer } from "@buildapps/lessons";
import type { LearnerProfile, Project, ProjectIntake, ProjectState } from "@buildapps/core";
import type { ActionStatus, Platform, ReasonCategory, ReviewOutcome } from "@buildapps/publishing";
import type {
  AbuseReportRow,
  AuditRow,
  ContentFlagRow,
  NotificationRow,
  ReportReason,
  ReportTarget,
  SupportCategory,
  SupportRow,
  DeletionRequestRow,
  PlacementCheck,
  StoredProfile,
  UserSummary,
  ActionRow,
  AttemptOutcome,
  Dashboard,
  ExpertRow,
  ExpertStatus,
  ExpertWorkspaceView,
  FindingRow,
  FindingStatus,
  HandoffRow,
  HandoffScope,
  InstallationRow,
  JobMilestoneRow,
  LessonPayload,
  PublishingView,
  PublishTargetRow,
  ReleaseRow,
  RequestEventRow,
  RequestStatus,
  RequestView,
  ServiceRequestRow,
  WorkspaceView,
} from "@buildapps/server/types";

export interface AdminOverview {
  users: number;
  suspendedUsers: number;
  openSupport: number;
  openReports: number;
  pendingExperts: number;
  requestsByStatus: Record<string, number>;
  openPublishingAssistance: number;
  awaitingMatch: number;
  lessons: number;
}
export interface AdminLesson {
  id: string;
  title: string;
  skillId: string;
  exercises: number;
  disabled: boolean;
  note: string | null;
}

export type {
  AbuseReportRow,
  AuditRow,
  ContentFlagRow,
  NotificationRow,
  ReportReason,
  ReportTarget,
  SupportCategory,
  SupportRow,
  DeletionRequestRow,
  PlacementCheck,
  StoredProfile,
  LearnerProfile,
  UserSummary,
  ActionRow,
  AttemptOutcome,
  Dashboard,
  ExpertRow,
  ExpertStatus,
  ExpertWorkspaceView,
  FindingRow,
  FindingStatus,
  HandoffRow,
  HandoffScope,
  InstallationRow,
  JobMilestoneRow,
  LessonPayload,
  Project,
  ProjectIntake,
  PublishingView,
  PublishTargetRow,
  ReleaseRow,
  RequestEventRow,
  RequestStatus,
  RequestView,
  ServiceRequestRow,
  WorkspaceView,
};

export interface RepoInfo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}
export interface VerifiedMilestoneInfo {
  milestoneKey: string;
  evidenceRef: string;
  reason: string;
}
export interface ScanResult {
  scanId: string;
  sync: { new: number; reopened: number; resolved: number };
  verified: VerifiedMilestoneInfo[];
  summary: { headline: string };
  limits: string[];
}
export interface VerificationCheckInfo {
  id: string;
  title: string;
  status: "pass" | "fail" | "skipped" | "unavailable";
  source: "static" | "ci_checks" | "sandbox";
  evidence: Record<string, unknown>;
}
export interface VerifyResult {
  runId: string;
  checks: VerificationCheckInfo[];
  verified: VerifiedMilestoneInfo[];
  sync: { new: number; reopened: number; resolved: number };
}
export interface ExpertRequestDetail {
  request: ServiceRequestRow;
  jobs: JobMilestoneRow[];
  handoff: HandoffRow | null;
  events: RequestEventRow[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current Supabase access token (same account on web, iOS and Android). */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

/** One typed client used by web and mobile, so both platforms share the same account and data. */
export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    if (!token) throw new ApiError(401, "unauthenticated", "Please sign in");
    const res = await f(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    } & T;
    if (!res.ok)
      throw new ApiError(
        res.status,
        json.error?.code ?? "error",
        json.error?.message ?? res.statusText,
      );
    return json;
  }
  const enc = encodeURIComponent;
  const pub = (p: string) => `/api/publishing${p}`;
  return {
    // ---- Publishing Center (owner side; manual tracking - nothing is submitted by BuildApps) ----
    publishing: {
      view: (projectId: string) => call<PublishingView>("GET", pub(`/projects/${enc(projectId)}`)),
      addTarget: (projectId: string, platform: Platform) =>
        call<{ target: PublishTargetRow }>("POST", pub(`/projects/${enc(projectId)}/targets`), {
          platform,
        }),
      saveMetadata: (targetId: string, metadata: Record<string, unknown>) =>
        call<{ target: PublishTargetRow }>(
          "PUT",
          pub(`/targets/${enc(targetId)}/metadata`),
          metadata,
        ),
      claim: (
        targetId: string,
        key: string,
        kind: "self_reported" | "not_applicable",
        note: string,
      ) =>
        call<{ removed: boolean }>("PUT", pub(`/targets/${enc(targetId)}/claims/${enc(key)}`), {
          kind,
          note,
        }),
      removeClaim: (targetId: string, key: string) =>
        call<{ removed: boolean }>("DELETE", pub(`/targets/${enc(targetId)}/claims/${enc(key)}`)),
      createRelease: (targetId: string, version: string, buildNumber?: string, notes?: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/targets/${enc(targetId)}/releases`), {
          version,
          ...(buildNumber ? { buildNumber } : {}),
          ...(notes ? { notes } : {}),
        }),
      markReady: (releaseId: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/ready`), {}),
      unready: (releaseId: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/unready`), {}),
      recordSubmission: (releaseId: string, storeReference?: string) =>
        call<{ alreadyRecorded: boolean }>(
          "POST",
          pub(`/releases/${enc(releaseId)}/submitted`),
          storeReference ? { storeReference } : {},
        ),
      markInReview: (releaseId: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/in-review`), {}),
      recordOutcome: (
        releaseId: string,
        outcome: ReviewOutcome,
        message: string,
        reasonCategory?: ReasonCategory,
        guidelineRef?: string,
      ) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/outcome`), {
          outcome,
          message,
          ...(reasonCategory ? { reasonCategory } : {}),
          ...(guidelineRef ? { guidelineRef } : {}),
        }),
      resubmit: (releaseId: string, storeReference?: string) =>
        call<{ alreadyRecorded: boolean }>(
          "POST",
          pub(`/releases/${enc(releaseId)}/resubmitted`),
          storeReference ? { storeReference } : {},
        ),
      markReleased: (releaseId: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/released`), {}),
      withdraw: (releaseId: string) =>
        call<{ release: ReleaseRow }>("POST", pub(`/releases/${enc(releaseId)}/withdraw`), {}),
      addAction: (releaseId: string, title: string, detail?: string) =>
        call<{ action: ActionRow }>("POST", pub(`/releases/${enc(releaseId)}/actions`), {
          title,
          ...(detail ? { detail } : {}),
        }),
      updateAction: (actionId: string, status: ActionStatus, note?: string) =>
        call<{ action: ActionRow }>("PATCH", pub(`/actions/${enc(actionId)}`), {
          status,
          ...(note ? { note } : {}),
        }),
      requestAssistance: (projectId: string, summary: string, targetId?: string) =>
        call<{ alreadyOpen: boolean }>("POST", pub(`/projects/${enc(projectId)}/assistance`), {
          summary,
          ...(targetId ? { targetId } : {}),
        }),
    },
    // ---- GitHub connection (read-only GitHub App) ----
    githubStatus: () =>
      call<{ available: boolean; connections: InstallationRow[] }>("GET", "/api/github"),
    githubConnect: () => call<{ url: string }>("POST", "/api/github/connect", {}),
    githubRepos: (connectionId: string) =>
      call<{ repos: RepoInfo[] }>("GET", `/api/github/connections/${enc(connectionId)}/repos`).then(
        (r) => r.repos,
      ),
    githubDisconnect: (connectionId: string) =>
      call<{ removed: true; remoteRevoked: boolean; note?: string }>(
        "DELETE",
        `/api/github/connections/${enc(connectionId)}`,
      ),
    // ---- Live project workspace, scanner, verification ----
    workspace: (projectId: string) =>
      call<WorkspaceView>("GET", `/api/workspace/${enc(projectId)}`),
    linkRepo: (projectId: string, installationId: string, repo: string) =>
      call<{ repo: string }>("POST", `/api/workspace/${enc(projectId)}/repo`, {
        installationId,
        repo,
      }),
    scan: (projectId: string) =>
      call<ScanResult>("POST", `/api/workspace/${enc(projectId)}/scan`, {}),
    verify: (projectId: string) =>
      call<VerifyResult>("POST", `/api/workspace/${enc(projectId)}/verify`, {}),
    setFindingStatus: (
      projectId: string,
      findingId: string,
      status: FindingStatus,
      note?: string,
    ) =>
      call<{ finding: FindingRow }>(
        "PATCH",
        `/api/workspace/${enc(projectId)}/findings/${enc(findingId)}`,
        { status, ...(note ? { note } : {}) },
      ).then((r) => r.finding),
    // ---- Human Developer Rescue: project owner ----
    myRequest: (id: string) => call<RequestView>("GET", `/api/rescue/requests/${enc(id)}`),
    grantHandoff: (id: string, scopes: HandoffScope[], days: number) =>
      call<{ handoff: HandoffRow }>("POST", `/api/rescue/requests/${enc(id)}/handoff`, {
        scopes,
        days,
      }),
    revokeHandoff: (id: string) =>
      call<{ revoked: number }>("DELETE", `/api/rescue/requests/${enc(id)}/handoff`),
    decideJob: (id: string, jobId: string, decision: "accept" | "reject", note?: string) =>
      call<{ job: JobMilestoneRow }>(
        "POST",
        `/api/rescue/requests/${enc(id)}/jobs/${enc(jobId)}/decision`,
        { decision, ...(note ? { note } : {}) },
      ),
    completeRequest: (id: string) =>
      call<{ request: ServiceRequestRow }>("POST", `/api/rescue/requests/${enc(id)}/complete`, {}),
    cancelRequest: (id: string) =>
      call<{ request: ServiceRequestRow }>("POST", `/api/rescue/requests/${enc(id)}/cancel`, {}),
    // ---- Human Developer Rescue: expert ----
    expertProfile: () =>
      call<{ profile: ExpertRow | null }>("GET", "/api/expert/profile").then((r) => r.profile),
    saveExpertProfile: (input: {
      displayName: string;
      headline?: string;
      bio?: string;
      skills: string[];
    }) => call<{ profile: ExpertRow }>("PUT", "/api/expert/profile", input).then((r) => r.profile),
    expertRequests: () =>
      call<{ requests: ServiceRequestRow[] }>("GET", "/api/expert/requests").then(
        (r) => r.requests,
      ),
    expertRequest: (id: string) =>
      call<ExpertRequestDetail>("GET", `/api/expert/requests/${enc(id)}`),
    expertWorkspace: (id: string) =>
      call<ExpertWorkspaceView>("GET", `/api/expert/requests/${enc(id)}/workspace`),
    expertAct: (id: string, action: "accept" | "decline" | "deliver") =>
      call<{ request: ServiceRequestRow }>("POST", `/api/expert/requests/${enc(id)}/${action}`, {}),
    expertAddJob: (id: string, title: string, description?: string) =>
      call<{ job: JobMilestoneRow }>("POST", `/api/expert/requests/${enc(id)}/jobs`, {
        title,
        ...(description ? { description } : {}),
      }),
    expertSubmitJob: (id: string, jobId: string, note: string, url?: string) =>
      call<{ job: JobMilestoneRow }>(
        "POST",
        `/api/expert/requests/${enc(id)}/jobs/${enc(jobId)}/submit`,
        { note, ...(url ? { url } : {}) },
      ),
    // ---- Administration (vetting + manual matching) ----
    adminMe: () => call<{ admin: boolean }>("GET", "/api/admin/me").then((r) => r.admin),
    adminExperts: (status?: ExpertStatus) =>
      call<{ experts: ExpertRow[] }>(
        "GET",
        `/api/admin/experts${status ? `?status=${status}` : ""}`,
      ).then((r) => r.experts),
    adminReviewExpert: (
      id: string,
      decision: "approved" | "rejected" | "suspended",
      note?: string,
    ) =>
      call<{ expert: ExpertRow }>("POST", `/api/admin/experts/${enc(id)}/review`, {
        decision,
        ...(note ? { note } : {}),
      }),
    adminRequests: (status?: RequestStatus) =>
      call<{ requests: ServiceRequestRow[] }>(
        "GET",
        `/api/admin/requests${status ? `?status=${status}` : ""}`,
      ).then((r) => r.requests),
    adminMatch: (requestId: string, expertId: string) =>
      call<{ request: ServiceRequestRow }>("POST", `/api/admin/requests/${enc(requestId)}/match`, {
        expertId,
      }),
    // ---- Administration (operations) ----
    adminOverview: () => call<AdminOverview>("GET", "/api/admin/overview"),
    adminUsers: (q?: string) =>
      call<{ users: UserSummary[] }>(
        "GET",
        `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ).then((r) => r.users),
    adminSetSuspension: (id: string, suspended: boolean, reason?: string) =>
      call<{ user: UserSummary }>("POST", `/api/admin/users/${enc(id)}/suspension`, {
        suspended,
        ...(reason ? { reason } : {}),
      }).then((r) => r.user),
    adminSupport: (status?: SupportRow["status"]) =>
      call<{ support: SupportRow[] }>(
        "GET",
        `/api/admin/support${status ? `?status=${status}` : ""}`,
      ).then((r) => r.support),
    adminUpdateSupport: (id: string, status: SupportRow["status"], note?: string) =>
      call<{ support: SupportRow }>("POST", `/api/admin/support/${enc(id)}`, {
        status,
        ...(note ? { note } : {}),
      }).then((r) => r.support),
    adminReports: (status?: AbuseReportRow["status"]) =>
      call<{ reports: AbuseReportRow[] }>(
        "GET",
        `/api/admin/reports${status ? `?status=${status}` : ""}`,
      ).then((r) => r.reports),
    adminReviewReport: (id: string, status: "actioned" | "dismissed", note: string) =>
      call<{ report: AbuseReportRow }>("POST", `/api/admin/reports/${enc(id)}/review`, {
        status,
        note,
      }).then((r) => r.report),
    adminAudit: () => call<{ audit: AuditRow[] }>("GET", "/api/admin/audit").then((r) => r.audit),
    adminContent: () =>
      call<{ lessons: AdminLesson[] }>("GET", "/api/admin/content").then((r) => r.lessons),
    adminSetLesson: (id: string, disabled: boolean, note?: string) =>
      call<{ flag: ContentFlagRow }>("POST", `/api/admin/content/${enc(id)}`, {
        disabled,
        ...(note ? { note } : {}),
      }).then((r) => r.flag),
    // ---- Onboarding profile and skill checks ----
    myProfile: () =>
      call<{ profile: StoredProfile | null }>("GET", "/api/profile").then((r) => r.profile),
    saveProfile: (v: LearnerProfile) =>
      call<{ profile: StoredProfile }>("PUT", "/api/profile", v).then((r) => r.profile),
    placement: (skillId: string) =>
      call<{ check: PlacementCheck }>("GET", `/api/placement/${enc(skillId)}`).then((r) => r.check),
    submitPlacement: (skillId: string, answers: Record<string, Answer>) =>
      call<{ passed: boolean; results: { exerciseId: string; correct: boolean }[] }>(
        "POST",
        `/api/placement/${enc(skillId)}`,
        { answers },
      ),

    // ---- Privacy (every signed-in user) ----
    exportMyData: () => call<Record<string, unknown>>("GET", "/api/privacy/export"),
    myDeletion: () =>
      call<{ request: DeletionRequestRow | null }>("GET", "/api/privacy/deletion").then(
        (r) => r.request,
      ),
    requestDeletion: (v: { confirm: string; reason?: string }) =>
      call<{ request: DeletionRequestRow }>("POST", "/api/privacy/deletion", v).then(
        (r) => r.request,
      ),
    cancelDeletion: () =>
      call<{ request: DeletionRequestRow }>("DELETE", "/api/privacy/deletion").then(
        (r) => r.request,
      ),
    adminDeletions: (status?: DeletionRequestRow["status"]) =>
      call<{ deletions: DeletionRequestRow[] }>(
        "GET",
        `/api/admin/privacy/deletions${status ? `?status=${status}` : ""}`,
      ).then((r) => r.deletions),
    adminRecordErasure: (id: string, note: string) =>
      call<{ deletion: DeletionRequestRow }>(
        "POST",
        `/api/admin/privacy/deletions/${enc(id)}/erasure`,
        { note },
      ).then((r) => r.deletion),

    // ---- Support, reporting, notifications (every signed-in user) ----
    mySupport: () => call<{ support: SupportRow[] }>("GET", "/api/support").then((r) => r.support),
    createSupport: (v: { category: SupportCategory; subject: string; body: string }) =>
      call<{ support: SupportRow }>("POST", "/api/support", v).then((r) => r.support),
    reportAbuse: (v: {
      targetType: ReportTarget;
      targetId: string;
      reason: ReportReason;
      detail?: string;
    }) => call<{ ok: boolean }>("POST", "/api/support/report", v),
    notifications: () =>
      call<{ notifications: NotificationRow[] }>("GET", "/api/notifications").then(
        (r) => r.notifications,
      ),
    markNotificationsRead: (ids: string[] | "all") =>
      call<{ updated: number }>("POST", "/api/notifications/read", { ids }),
    // ---- Learning, projects ----
    dashboard: () => call<Dashboard>("GET", "/api/dashboard"),
    lesson: (id: string) => call<LessonPayload>("GET", `/api/lessons/${encodeURIComponent(id)}`),
    submitAttempt: (exerciseId: string, answer: Answer, timeZone?: string) =>
      call<AttemptOutcome>("POST", "/api/attempts", { exerciseId, answer, timeZone }),
    listProjects: () =>
      call<{ projects: Project[] }>("GET", "/api/projects").then((r) => r.projects),
    createProject: (intake: ProjectIntake) =>
      call<{ project: Project }>("POST", "/api/projects", intake).then((r) => r.project),
    setProjectState: (id: string, state: ProjectState) =>
      call<{ project: Project }>("POST", `/api/projects/${id}/state`, { state }).then(
        (r) => r.project,
      ),
    reportMilestone: (id: string, key: string) =>
      call<{ project: Project }>(
        "POST",
        `/api/projects/${id}/milestones/${encodeURIComponent(key)}/report`,
      ).then((r) => r.project),
    advanceRecovery: (id: string) =>
      call<{ project: Project }>("POST", `/api/projects/${id}/recovery/advance`).then(
        (r) => r.project,
      ),
    requestHumanHelp: (id: string, summary: string) =>
      call<{ project: Project }>("POST", `/api/projects/${id}/help-request`, { summary }).then(
        (r) => r.project,
      ),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
