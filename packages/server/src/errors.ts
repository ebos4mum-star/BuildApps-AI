export type WorkspaceErrorCode =
  | "not_found"
  | "forbidden"
  | "not_connected"
  | "rate_limited"
  | "invalid"
  | "conflict"
  | "github_error"
  | "unavailable";
export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
  ) {
    super(message);
  }
}
