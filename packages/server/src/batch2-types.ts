import type { Evidence, FindingKind, Severity, VerificationCheck } from "@buildapps/scanner";
import type { InstallationInfo } from "@buildapps/github/types";
import type { RepoRef } from "@buildapps/core";

export interface InstallationRow extends InstallationInfo {
  id: string;
  userId: string;
  createdAt: string;
}

export interface ScanAssessment {
  headline: string;
  byKind: Record<FindingKind, number>;
  bySeverity: Record<Severity, number>;
  frameworks: string[];
  languages: string[];
  analysisLevel: string;
  limits: string[];
  tasks: {
    priority: number;
    title: string;
    action: string;
    kind: FindingKind;
    severity: Severity;
  }[];
}
export interface ScanRow {
  id: string;
  projectId: string;
  requestedBy: string;
  commitSha: string | null;
  ref: string | null;
  status: "running" | "complete" | "failed";
  stats: Record<string, unknown>;
  assessment: ScanAssessment | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type FindingStatus = "open" | "in_progress" | "resolved" | "dismissed";
export type ResolutionSource = "user" | "rescan" | "verification";
export interface FindingRow {
  id: string;
  projectId: string;
  ruleId: string;
  fingerprint: string;
  kind: FindingKind;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  remedy: string;
  evidence: Evidence[];
  milestoneKey: string | null;
  status: FindingStatus;
  statusNote: string | null;
  decidedByUser: boolean;
  resolutionSource: ResolutionSource | null;
  firstSeenScan: string | null;
  lastSeenScan: string | null;
  createdAt: string;
  updatedAt: string;
}
/** A finding as produced by the scanner, ready to merge (milestone key already mapped). */
export interface IncomingFinding {
  ruleId: string;
  fingerprint: string;
  kind: FindingKind;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  remedy: string;
  evidence: Evidence[];
  milestoneKey: string | null;
}
export interface SyncStats {
  new: number;
  reopened: number;
  resolved: number;
}

export interface VerificationRunRow {
  id: string;
  projectId: string;
  requestedBy: string;
  commitSha: string | null;
  status: "complete" | "failed";
  checks: VerificationCheck[];
  createdAt: string;
}

export interface GitHubStore {
  upsertInstallation(userId: string, info: InstallationInfo): Promise<InstallationRow>;
  listInstallations(userId: string): Promise<InstallationRow[]>;
  getInstallation(userId: string, rowId: string): Promise<InstallationRow | null>;
  /** All BuildApps users connected to one GitHub installation (webhooks, safe uninstall). */
  findByGithubId(installationId: number): Promise<InstallationRow[]>;
  /** Deletes the row; projects linked to it are unlinked (FK set null). */
  deleteInstallation(userId: string, rowId: string): Promise<void>;
  deleteByGithubId(installationId: number): Promise<void>;
}

export interface ScanStore {
  createScan(input: { projectId: string; requestedBy: string; now: Date }): Promise<ScanRow>;
  completeScan(
    id: string,
    patch: {
      commitSha: string | null;
      ref: string | null;
      stats: Record<string, unknown>;
      assessment: ScanAssessment;
      now: Date;
    },
  ): Promise<void>;
  failScan(id: string, error: string, now: Date): Promise<void>;
  /** Merges findings atomically (SQL: sync_findings). Preserves user decisions. */
  syncFindings(projectId: string, scanId: string, findings: IncomingFinding[]): Promise<SyncStats>;
  listFindings(projectId: string): Promise<FindingRow[]>;
  getFinding(projectId: string, findingId: string): Promise<FindingRow | null>;
  updateFinding(
    projectId: string,
    findingId: string,
    patch: {
      status: FindingStatus;
      statusNote: string | null;
      decidedByUser: boolean;
      resolutionSource: ResolutionSource | null;
      now: Date;
    },
  ): Promise<FindingRow>;
  latestScan(projectId: string): Promise<ScanRow | null>;
  countScansSince(projectId: string, since: Date): Promise<number>;
  createVerificationRun(input: {
    projectId: string;
    requestedBy: string;
    commitSha: string | null;
    status: "complete" | "failed";
    checks: VerificationCheck[];
    now: Date;
  }): Promise<VerificationRunRow>;
  latestVerification(projectId: string): Promise<VerificationRunRow | null>;
}

export type ExpertStatus = "pending" | "approved" | "rejected" | "suspended";
export interface ExpertRow {
  id: string;
  userId: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  status: ExpertStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}
export type RequestStatus =
  "submitted" | "matched" | "in_progress" | "delivered" | "completed" | "cancelled";
export interface ServiceRequestRow {
  id: string;
  projectId: string;
  requesterId: string;
  summary: string;
  status: RequestStatus;
  assignedExpertId: string | null;
  matchedAt: string | null;
  completedAt: string | null;
  completionEvidence: Record<string, unknown> | null;
  /** rescue = fix a stuck project; publishing = help getting an app published (manual tracking only). */
  kind: "rescue" | "publishing";
  publishTargetId: string | null;
  createdAt: string;
}
export const HANDOFF_SCOPES = [
  "view_project",
  "view_scans",
  "view_findings",
  "view_verification",
  "view_publishing",
] as const;
export type HandoffScope = (typeof HANDOFF_SCOPES)[number];
export interface HandoffRow {
  id: string;
  serviceRequestId: string;
  projectId: string;
  expertId: string;
  scopes: HandoffScope[];
  status: "active" | "revoked";
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
export type JobMilestoneStatus = "todo" | "in_progress" | "submitted" | "accepted" | "rejected";
export interface JobMilestoneRow {
  id: string;
  serviceRequestId: string;
  title: string;
  description: string | null;
  position: number;
  status: JobMilestoneStatus;
  deliverableNote: string | null;
  deliverableUrl: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export type EventRole = "owner" | "expert" | "admin" | "system";
export interface RequestEventRow {
  id: string;
  serviceRequestId: string;
  actorId: string | null;
  actorRole: EventRole;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface RescueStore {
  addEvent(
    requestId: string,
    actorId: string | null,
    role: EventRole,
    action: string,
    detail: Record<string, unknown>,
    now: Date,
  ): Promise<void>;
  listEvents(requestId: string): Promise<RequestEventRow[]>;
  isAdmin(userId: string): Promise<boolean>;
  upsertExpertApplication(
    userId: string,
    input: { displayName: string; headline: string | null; bio: string | null; skills: string[] },
  ): Promise<ExpertRow>;
  getExpertByUser(userId: string): Promise<ExpertRow | null>;
  getExpert(id: string): Promise<ExpertRow | null>;
  listExperts(status?: ExpertStatus): Promise<ExpertRow[]>;
  reviewExpert(
    id: string,
    adminId: string,
    status: ExpertStatus,
    note: string | null,
    now: Date,
  ): Promise<ExpertRow>;
  getRequest(id: string): Promise<ServiceRequestRow | null>;
  listRequestsForRequester(userId: string): Promise<ServiceRequestRow[]>;
  listRequestsForExpert(expertId: string): Promise<ServiceRequestRow[]>;
  listAllRequests(status?: RequestStatus): Promise<ServiceRequestRow[]>;
  updateRequest(
    id: string,
    patch: Partial<
      Pick<
        ServiceRequestRow,
        "status" | "assignedExpertId" | "matchedAt" | "completedAt" | "completionEvidence"
      >
    >,
  ): Promise<ServiceRequestRow>;
  activeHandoff(requestId: string): Promise<HandoffRow | null>;
  listHandoffs(requestId: string): Promise<HandoffRow[]>;
  createHandoff(input: {
    serviceRequestId: string;
    projectId: string;
    expertId: string;
    scopes: HandoffScope[];
    now: Date;
    expiresAt: Date;
  }): Promise<HandoffRow>;
  revokeHandoffs(requestId: string, now: Date): Promise<number>;
  listJobMilestones(requestId: string): Promise<JobMilestoneRow[]>;
  addJobMilestone(
    requestId: string,
    input: { title: string; description: string | null },
    now: Date,
  ): Promise<JobMilestoneRow>;
  updateJobMilestone(
    id: string,
    patch: Partial<
      Pick<
        JobMilestoneRow,
        | "status"
        | "deliverableNote"
        | "deliverableUrl"
        | "submittedAt"
        | "decidedAt"
        | "decisionNote"
      >
    >,
  ): Promise<JobMilestoneRow>;
}

export type { RepoRef };
