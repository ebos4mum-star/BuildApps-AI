import type { Answer } from "@buildapps/lessons";
import type { Project, ProjectIntake, ProjectState } from "@buildapps/core";
import type { AttemptOutcome, Dashboard, LessonPayload } from "@buildapps/server/types";

export type { AttemptOutcome, Dashboard, LessonPayload, Project, ProjectIntake };

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
  return {
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
