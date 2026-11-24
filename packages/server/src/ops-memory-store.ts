import { randomUUID } from "node:crypto";
import type { MemoryDb } from "./memory-store";
import type {
  AbuseReportRow,
  AuditRow,
  ContentFlagRow,
  DeletionRequestRow,
  NotificationRow,
  OpsCounts,
  OpsStore,
  SupportRow,
  UserSummary,
} from "./ops-types";

export class MemoryOpsStore implements OpsStore {
  suspended = new Map<string, string | null>();
  audit: AuditRow[] = [];
  support = new Map<string, SupportRow>();
  reports = new Map<string, AbuseReportRow>();
  flags = new Map<string, ContentFlagRow>();
  notifications: NotificationRow[] = [];
  deletions: DeletionRequestRow[] = [];
  private seq = 0;
  constructor(private db: MemoryDb) {}

  private summary(id: string): UserSummary {
    return {
      id,
      displayName: id.startsWith("dev:") ? id.slice(4) : id.slice(0, 8),
      createdAt: this.db.users.get(id) ? "2026-01-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
      suspended: this.suspended.has(id),
      suspendedReason: this.suspended.get(id) ?? null,
    };
  }
  async listUsers(q: string | undefined, limit: number) {
    const ids = new Set<string>([...this.db.users.keys(), ...this.suspended.keys()]);
    return [...ids]
      .map((id) => this.summary(id))
      .filter(
        (u) =>
          !q ||
          u.id.toLowerCase().includes(q.toLowerCase()) ||
          (u.displayName ?? "").toLowerCase().includes(q.toLowerCase()),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit);
  }
  async getUser(userId: string) {
    return this.db.users.has(userId) || this.suspended.has(userId) ? this.summary(userId) : null;
  }
  async isSuspended(userId: string) {
    return this.suspended.has(userId);
  }
  async setSuspended(userId: string, suspended: boolean, reason: string | null) {
    if (suspended) this.suspended.set(userId, reason);
    else this.suspended.delete(userId);
  }
  async counts(): Promise<OpsCounts> {
    return {
      users: this.db.users.size,
      suspendedUsers: this.suspended.size,
      openSupport: [...this.support.values()].filter((s) => s.status === "open").length,
      openReports: [...this.reports.values()].filter((r) => r.status === "open").length,
    };
  }
  async appendAudit(e: Omit<AuditRow, "id" | "createdAt">, now: Date) {
    this.audit.push({ ...e, id: ++this.seq, createdAt: now.toISOString() });
  }
  async listAudit(limit: number) {
    return [...this.audit].reverse().slice(0, limit);
  }
  async createSupport(
    userId: string,
    v: { category: SupportRow["category"]; subject: string; body: string },
    now: Date,
  ) {
    const row: SupportRow = {
      id: randomUUID(),
      userId,
      ...v,
      status: "open",
      adminNote: null,
      handledBy: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.support.set(row.id, row);
    return row;
  }
  async getSupport(id: string) {
    return this.support.get(id) ?? null;
  }
  async listSupportForUser(userId: string) {
    return [...this.support.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listSupport(status?: SupportRow["status"]) {
    return [...this.support.values()]
      .filter((s) => !status || s.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async updateSupport(
    id: string,
    patch: { status: SupportRow["status"]; adminNote: string | null; handledBy: string },
    now: Date,
  ) {
    const row = { ...this.support.get(id)!, ...patch, updatedAt: now.toISOString() };
    this.support.set(id, row);
    return row;
  }
  async createReport(
    reporterId: string,
    v: Pick<AbuseReportRow, "targetType" | "targetId" | "reason" | "detail">,
    now: Date,
  ) {
    const row: AbuseReportRow = {
      id: randomUUID(),
      reporterId,
      ...v,
      status: "open",
      reviewNote: null,
      reviewedBy: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.reports.set(row.id, row);
    return row;
  }
  async getReport(id: string) {
    return this.reports.get(id) ?? null;
  }
  async listReports(status?: AbuseReportRow["status"]) {
    return [...this.reports.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async reviewReport(
    id: string,
    patch: { status: "actioned" | "dismissed"; note: string | null; reviewedBy: string },
    now: Date,
  ) {
    const row: AbuseReportRow = {
      ...this.reports.get(id)!,
      status: patch.status,
      reviewNote: patch.note,
      reviewedBy: patch.reviewedBy,
      updatedAt: now.toISOString(),
    };
    this.reports.set(id, row);
    return row;
  }
  async listContentFlags() {
    return [...this.flags.values()];
  }
  async setContentFlag(
    lessonId: string,
    disabled: boolean,
    note: string | null,
    actorId: string,
    now: Date,
  ) {
    const row = { lessonId, disabled, note, updatedBy: actorId, updatedAt: now.toISOString() };
    this.flags.set(lessonId, row);
    return row;
  }
  async addNotification(
    userId: string,
    n: { kind: string; title: string; body?: string | null; link?: string | null },
    now: Date,
  ) {
    this.notifications.push({
      id: randomUUID(),
      userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      readAt: null,
      createdAt: now.toISOString(),
    });
  }
  async listNotifications(userId: string, limit: number) {
    return this.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async markNotificationsRead(userId: string, ids: string[] | "all", now: Date) {
    let n = 0;
    for (const x of this.notifications)
      if (x.userId === userId && !x.readAt && (ids === "all" || ids.includes(x.id))) {
        x.readAt = now.toISOString();
        n++;
      }
    return n;
  }
  async createDeletionRequest(
    userId: string,
    v: { reason: string | null; notBefore: Date },
    now: Date,
  ) {
    if (this.deletions.some((d) => d.userId === userId && d.status === "pending"))
      throw new Error("create deletion request: duplicate pending request");
    const row: DeletionRequestRow = {
      id: randomUUID(),
      userId,
      status: "pending",
      reason: v.reason,
      requestedAt: now.toISOString(),
      notBefore: v.notBefore.toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      note: null,
    };
    this.deletions.push(row);
    return row;
  }
  async getPendingDeletion(userId: string) {
    return this.deletions.find((d) => d.userId === userId && d.status === "pending") ?? null;
  }
  async latestDeletion(userId: string) {
    return (
      [...this.deletions]
        .filter((d) => d.userId === userId)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] ?? null
    );
  }
  async getDeletion(id: string) {
    return this.deletions.find((d) => d.id === id) ?? null;
  }
  async listDeletions(status?: DeletionRequestRow["status"]) {
    return this.deletions
      .filter((d) => !status || d.status === status)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }
  async resolveDeletion(
    id: string,
    patch: { status: "cancelled" | "fulfilled"; note: string | null; resolvedBy: string | null },
    now: Date,
  ) {
    const row = this.deletions.find((d) => d.id === id)!;
    Object.assign(row, {
      status: patch.status,
      note: patch.note,
      resolvedBy: patch.resolvedBy,
      resolvedAt: now.toISOString(),
    });
    return row;
  }
}
