export type SupportCategory =
  "account" | "learning" | "project" | "expert" | "publishing" | "other";
export type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
export type ReportTarget = "user" | "expert" | "project" | "request";
export type ReportReason =
  "spam" | "harassment" | "unsafe_content" | "impersonation" | "fraud" | "other";
export type ReportStatus = "open" | "actioned" | "dismissed";

export interface UserSummary {
  id: string;
  displayName: string | null;
  createdAt: string;
  suspended: boolean;
  suspendedReason: string | null;
}
export interface SupportRow {
  id: string;
  userId: string;
  category: SupportCategory;
  subject: string;
  body: string;
  status: SupportStatus;
  adminNote: string | null;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AbuseReportRow {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AuditRow {
  id: number;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
export interface ContentFlagRow {
  lessonId: string;
  disabled: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}
export interface NotificationRow {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
export type DeletionStatus = "pending" | "cancelled" | "fulfilled";
export interface DeletionRequestRow {
  id: string;
  userId: string;
  status: DeletionStatus;
  reason: string | null;
  requestedAt: string;
  /** Erasure may not be carried out before this time (cooling-off). */
  notBefore: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
}
export interface OpsCounts {
  users: number;
  suspendedUsers: number;
  openSupport: number;
  openReports: number;
}

/** Persistence port for admin operations. Every write is server-side (service role). */
export interface OpsStore {
  listUsers(q: string | undefined, limit: number): Promise<UserSummary[]>;
  getUser(userId: string): Promise<UserSummary | null>;
  isSuspended(userId: string): Promise<boolean>;
  setSuspended(
    userId: string,
    suspended: boolean,
    reason: string | null,
    actorId: string,
    now: Date,
  ): Promise<void>;
  counts(): Promise<OpsCounts>;

  appendAudit(e: Omit<AuditRow, "id" | "createdAt">, now: Date): Promise<void>;
  listAudit(limit: number): Promise<AuditRow[]>;

  createSupport(
    userId: string,
    v: { category: SupportCategory; subject: string; body: string },
    now: Date,
  ): Promise<SupportRow>;
  getSupport(id: string): Promise<SupportRow | null>;
  listSupportForUser(userId: string): Promise<SupportRow[]>;
  listSupport(status?: SupportStatus): Promise<SupportRow[]>;
  updateSupport(
    id: string,
    patch: { status: SupportStatus; adminNote: string | null; handledBy: string },
    now: Date,
  ): Promise<SupportRow>;

  createReport(
    reporterId: string,
    v: { targetType: ReportTarget; targetId: string; reason: ReportReason; detail: string | null },
    now: Date,
  ): Promise<AbuseReportRow>;
  getReport(id: string): Promise<AbuseReportRow | null>;
  listReports(status?: ReportStatus): Promise<AbuseReportRow[]>;
  reviewReport(
    id: string,
    patch: { status: "actioned" | "dismissed"; note: string | null; reviewedBy: string },
    now: Date,
  ): Promise<AbuseReportRow>;

  listContentFlags(): Promise<ContentFlagRow[]>;
  setContentFlag(
    lessonId: string,
    disabled: boolean,
    note: string | null,
    actorId: string,
    now: Date,
  ): Promise<ContentFlagRow>;

  addNotification(
    userId: string,
    n: { kind: string; title: string; body?: string | null; link?: string | null },
    now: Date,
  ): Promise<void>;
  listNotifications(userId: string, limit: number): Promise<NotificationRow[]>;
  markNotificationsRead(userId: string, ids: string[] | "all", now: Date): Promise<number>;

  createDeletionRequest(
    userId: string,
    v: { reason: string | null; notBefore: Date },
    now: Date,
  ): Promise<DeletionRequestRow>;
  getPendingDeletion(userId: string): Promise<DeletionRequestRow | null>;
  latestDeletion(userId: string): Promise<DeletionRequestRow | null>;
  getDeletion(id: string): Promise<DeletionRequestRow | null>;
  listDeletions(status?: DeletionStatus): Promise<DeletionRequestRow[]>;
  resolveDeletion(
    id: string,
    patch: { status: "cancelled" | "fulfilled"; note: string | null; resolvedBy: string | null },
    now: Date,
  ): Promise<DeletionRequestRow>;
}
