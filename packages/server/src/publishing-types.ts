import type {
  Claim,
  Platform,
  ReasonCategory,
  ReleaseStatus,
  ReviewOutcome,
  TargetMetadata,
  ActionStatus,
} from "@buildapps/publishing";

export interface PublishTargetRow {
  id: string;
  projectId: string;
  platform: Platform;
  metadata: TargetMetadata;
  createdAt: string;
  updatedAt: string;
}
export interface ClaimRow extends Claim {
  targetId: string;
  key: string;
}
export interface ReleaseRow {
  id: string;
  targetId: string;
  version: string;
  buildNumber: string | null;
  notes: string | null;
  status: ReleaseStatus;
  createdAt: string;
  updatedAt: string;
}
export type SubmissionStatus = "submitted" | "in_review" | "approved" | "rejected" | "withdrawn";
export interface SubmissionRow {
  id: string;
  releaseId: string;
  attemptNumber: number;
  status: SubmissionStatus;
  storeReference: string | null;
  submittedAt: string;
  decidedAt: string | null;
}
export interface FeedbackRow {
  id: string;
  submissionId: string;
  outcome: ReviewOutcome;
  reasonCategory: ReasonCategory;
  guidelineRef: string | null;
  message: string;
  createdAt: string;
}
export interface ActionRow {
  id: string;
  releaseId: string;
  feedbackId: string | null;
  title: string;
  detail: string | null;
  requirementKey: string | null;
  findingId: string | null;
  status: ActionStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}
export interface PublishEventRow {
  id: string;
  projectId: string;
  targetId: string | null;
  releaseId: string | null;
  actorId: string | null;
  actorRole: "owner" | "expert" | "admin" | "system";
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export class DuplicateError extends Error {}

export interface PublishingStore {
  listTargets(projectId: string): Promise<PublishTargetRow[]>;
  getTarget(id: string): Promise<PublishTargetRow | null>;
  /** Idempotent: returns the existing target for (project, platform). */
  createTarget(projectId: string, platform: Platform, now: Date): Promise<PublishTargetRow>;
  updateMetadata(id: string, metadata: TargetMetadata, now: Date): Promise<PublishTargetRow>;
  listClaims(targetId: string): Promise<ClaimRow[]>;
  upsertClaim(targetId: string, key: string, claim: Claim): Promise<void>;
  deleteClaim(targetId: string, key: string): Promise<void>;
  listReleases(targetId: string): Promise<ReleaseRow[]>;
  getRelease(id: string): Promise<ReleaseRow | null>;
  /** Throws DuplicateError when (target, version) exists. */
  createRelease(
    targetId: string,
    input: { version: string; buildNumber: string | null; notes: string | null },
    now: Date,
  ): Promise<ReleaseRow>;
  updateRelease(
    id: string,
    patch: Partial<Pick<ReleaseRow, "status" | "notes" | "buildNumber">>,
    now: Date,
  ): Promise<ReleaseRow>;
  listSubmissions(releaseId: string): Promise<SubmissionRow[]>;
  /** Throws DuplicateError when an active attempt already exists or the attempt number is taken. */
  createSubmission(
    releaseId: string,
    attemptNumber: number,
    storeReference: string | null,
    now: Date,
  ): Promise<SubmissionRow>;
  updateSubmission(
    id: string,
    patch: Partial<Pick<SubmissionRow, "status" | "decidedAt">>,
  ): Promise<SubmissionRow>;
  listFeedback(releaseId: string): Promise<FeedbackRow[]>;
  addFeedback(
    submissionId: string,
    input: Omit<FeedbackRow, "id" | "submissionId" | "createdAt">,
    now: Date,
  ): Promise<FeedbackRow>;
  listActions(releaseId: string): Promise<ActionRow[]>;
  getAction(id: string): Promise<ActionRow | null>;
  addAction(
    releaseId: string,
    input: Pick<ActionRow, "feedbackId" | "title" | "detail" | "requirementKey" | "findingId">,
    now: Date,
  ): Promise<ActionRow>;
  updateAction(
    id: string,
    patch: { status: ActionStatus; note: string | null; doneAt: string | null },
    now: Date,
  ): Promise<ActionRow>;
  addEvent(e: Omit<PublishEventRow, "id" | "createdAt">, now: Date): Promise<void>;
  listEvents(projectId: string, limit: number): Promise<PublishEventRow[]>;
}
