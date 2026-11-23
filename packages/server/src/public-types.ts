/**
 * Type-only surface shared with CLIENTS (web + mobile) via `@buildapps/server/types`.
 * Everything reachable from here must stay free of Node-only code (crypto, GitHub App keys, etc.).
 * Clients must never import from the package root `@buildapps/server`.
 */
export type { Dashboard, LessonPayload } from "./dashboard";
export type { AttemptOutcome } from "./attempts";
export type { WorkspaceView } from "./workspace";
export type { RequestView, ExpertWorkspaceView } from "./experts";
export type {
  EventRole,
  RequestEventRow,
  ExpertRow,
  ExpertStatus,
  FindingRow,
  FindingStatus,
  HandoffRow,
  HandoffScope,
  InstallationRow,
  JobMilestoneRow,
  JobMilestoneStatus,
  RequestStatus,
  ScanAssessment,
  ScanRow,
  ServiceRequestRow,
  VerificationRunRow,
  ResolutionSource,
} from "./batch2-types";
export { HANDOFF_SCOPES } from "./batch2-types";
