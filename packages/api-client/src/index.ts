import type { Answer } from "@buildapps/lessons";
import type { Project, ProjectIntake, ProjectState } from "@buildapps/core";
import type {
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
  RequestStatus,
  RequestView,
  ServiceRequestRow,
  WorkspaceView,
} from "@buildapps/server/types";

export type {
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
  return {
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
    myRequests: () =>
      call<{ requests: RequestView[] }>("GET", "/api/rescue/requests").then((r) => r.requests),
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
    // ---- Learning, projects ----
    dashboard: () => call<Dashboard>("GET", "/api/dashboard"),
    lesson: (id: string) => call<LessonPayload>("GET", `/api/lessons/${encodeURIComponent(id)}`),
    submitAttempt: (exerciseId: string, answer: Answer, timeZone?: string) =>
      call<AttemptOutcome>("POST", "/api/attempts", { exerciseId, answer, timeZone }),
    listProjects: () =>
      call<{ projects: Project[] }>("GET", "/api/projects").then((r) => r.projects),
    createProject: (intake: ProjectIntake) =>
      call<{ project: Project }>("POST", "/api/projects", intake).then((r) => r.project),
    getProject: (id: string) =>
      call<{ project: Project }>("GET", `/api/projects/${id}`).then((r) => r.project),
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
