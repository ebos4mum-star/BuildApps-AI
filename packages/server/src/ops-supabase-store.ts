import type { SupabaseClient } from "@supabase/supabase-js";
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

function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw PostgREST rows

const toSupport = (r: R): SupportRow => ({
  id: r.id,
  userId: r.user_id,
  category: r.category,
  subject: r.subject,
  body: r.body,
  status: r.status,
  adminNote: r.admin_note,
  handledBy: r.handled_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toDeletion = (r: R): DeletionRequestRow => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  reason: r.reason,
  requestedAt: r.requested_at,
  notBefore: r.not_before,
  resolvedAt: r.resolved_at,
  resolvedBy: r.resolved_by,
  note: r.note,
});
const toReport = (r: R): AbuseReportRow => ({
  id: r.id,
  reporterId: r.reporter_id,
  targetType: r.target_type,
  targetId: r.target_id,
  reason: r.reason,
  detail: r.detail,
  status: r.status,
  reviewNote: r.review_note,
  reviewedBy: r.reviewed_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toFlag = (r: R): ContentFlagRow => ({
  lessonId: r.lesson_id,
  disabled: r.disabled,
  note: r.note,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});
const toNotification = (r: R): NotificationRow => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  readAt: r.read_at,
  createdAt: r.created_at,
});

export class SupabaseOpsStore implements OpsStore {
  constructor(private db: SupabaseClient) {}

  private async statusMap(ids: string[]) {
    if (!ids.length) return new Map<string, R>();
    const { data, error } = await this.db.from("account_status").select("*").in("user_id", ids);
    fail("load account status", error);
    return new Map((data ?? []).map((r: R) => [r.user_id as string, r]));
  }
  async listUsers(q: string | undefined, limit: number): Promise<UserSummary[]> {
    let query = this.db
      .from("profiles")
      .select("id, display_name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) {
      const safe = q.replace(/[%_,()\\]/g, "");
      if (/^[0-9a-f-]{36}$/i.test(safe)) query = query.eq("id", safe);
      else query = query.ilike("display_name", `%${safe}%`);
    }
    const { data, error } = await query;
    fail("list users", error);
    const status = await this.statusMap((data ?? []).map((r: R) => r.id));
    return (data ?? []).map((r: R) => ({
      id: r.id,
      displayName: r.display_name,
      createdAt: r.created_at,
      suspended: status.get(r.id)?.suspended ?? false,
      suspendedReason: status.get(r.id)?.reason ?? null,
    }));
  }
  async getUser(userId: string) {
    const { data, error } = await this.db
      .from("profiles")
      .select("id, display_name, created_at")
      .eq("id", userId)
      .maybeSingle();
    fail("get user", error);
    if (!data) return null;
    const status = await this.statusMap([userId]);
    return {
      id: data.id,
      displayName: data.display_name,
      createdAt: data.created_at,
      suspended: status.get(userId)?.suspended ?? false,
      suspendedReason: status.get(userId)?.reason ?? null,
    };
  }
  async isSuspended(userId: string) {
    const { data, error } = await this.db
      .from("account_status")
      .select("suspended")
      .eq("user_id", userId)
      .maybeSingle();
    fail("check suspension", error);
    return data?.suspended === true;
  }
  async setSuspended(
    userId: string,
    suspended: boolean,
    reason: string | null,
    actorId: string,
    now: Date,
  ) {
    const { error } = await this.db.from("account_status").upsert({
      user_id: userId,
      suspended,
      reason,
      updated_by: actorId,
      updated_at: now.toISOString(),
    });
    fail("set suspension", error);
  }
  async counts(): Promise<OpsCounts> {
    const c = async (t: string, eq?: [string, string | boolean]) => {
      const base = this.db.from(t).select("*", { count: "exact", head: true });
      const { count, error } = await (eq ? base.eq(eq[0], eq[1]) : base);
      fail(`count ${t}`, error);
      return count ?? 0;
    };
    const [users, suspendedUsers, openSupport, openReports] = await Promise.all([
      c("profiles"),
      c("account_status", ["suspended", true]),
      c("support_requests", ["status", "open"]),
      c("abuse_reports", ["status", "open"]),
    ]);
    return { users, suspendedUsers, openSupport, openReports };
  }
  async appendAudit(e: Omit<AuditRow, "id" | "createdAt">, now: Date) {
    const { error } = await this.db.from("admin_audit").insert({
      actor_id: e.actorId,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId,
      detail: e.detail,
      created_at: now.toISOString(),
    });
    fail("append audit", error);
  }
  async listAudit(limit: number): Promise<AuditRow[]> {
    const { data, error } = await this.db
      .from("admin_audit")
      .select("*")
      .order("id", { ascending: false })
      .limit(limit);
    fail("list audit", error);
    return (data ?? []).map((r: R) => ({
      id: Number(r.id),
      actorId: r.actor_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail ?? {},
      createdAt: r.created_at,
    }));
  }
  async createSupport(
    userId: string,
    v: { category: SupportRow["category"]; subject: string; body: string },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("support_requests")
      .insert({
        user_id: userId,
        category: v.category,
        subject: v.subject,
        body: v.body,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    fail("create support request", error);
    return toSupport(data);
  }
  async getSupport(id: string) {
    const { data, error } = await this.db
      .from("support_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get support request", error);
    return data ? toSupport(data) : null;
  }
  async listSupportForUser(userId: string) {
    const { data, error } = await this.db
      .from("support_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    fail("list my support", error);
    return (data ?? []).map(toSupport);
  }
  async listSupport(status?: SupportRow["status"]) {
    let q = this.db.from("support_requests").select("*").order("created_at").limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    fail("list support", error);
    return (data ?? []).map(toSupport);
  }
  async updateSupport(
    id: string,
    patch: { status: SupportRow["status"]; adminNote: string | null; handledBy: string },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("support_requests")
      .update({
        status: patch.status,
        admin_note: patch.adminNote,
        handled_by: patch.handledBy,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    fail("update support", error);
    return toSupport(data);
  }
  async createReport(
    reporterId: string,
    v: Pick<AbuseReportRow, "targetType" | "targetId" | "reason" | "detail">,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("abuse_reports")
      .insert({
        reporter_id: reporterId,
        target_type: v.targetType,
        target_id: v.targetId,
        reason: v.reason,
        detail: v.detail,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    fail("create report", error);
    return toReport(data);
  }
  async getReport(id: string) {
    const { data, error } = await this.db
      .from("abuse_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get report", error);
    return data ? toReport(data) : null;
  }
  async listReports(status?: AbuseReportRow["status"]) {
    let q = this.db.from("abuse_reports").select("*").order("created_at").limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    fail("list reports", error);
    return (data ?? []).map(toReport);
  }
  async reviewReport(
    id: string,
    patch: { status: "actioned" | "dismissed"; note: string | null; reviewedBy: string },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("abuse_reports")
      .update({
        status: patch.status,
        review_note: patch.note,
        reviewed_by: patch.reviewedBy,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    fail("review report", error);
    return toReport(data);
  }
  async listContentFlags() {
    const { data, error } = await this.db.from("content_flags").select("*");
    fail("list content flags", error);
    return (data ?? []).map(toFlag);
  }
  async setContentFlag(
    lessonId: string,
    disabled: boolean,
    note: string | null,
    actorId: string,
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("content_flags")
      .upsert({
        lesson_id: lessonId,
        disabled,
        note,
        updated_by: actorId,
        updated_at: now.toISOString(),
      })
      .select()
      .single();
    fail("set content flag", error);
    return toFlag(data);
  }
  async addNotification(
    userId: string,
    n: { kind: string; title: string; body?: string | null; link?: string | null },
    now: Date,
  ) {
    const { error } = await this.db.from("notifications").insert({
      user_id: userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      created_at: now.toISOString(),
    });
    fail("add notification", error);
  }
  async listNotifications(userId: string, limit: number) {
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    fail("list notifications", error);
    return (data ?? []).map(toNotification);
  }
  async markNotificationsRead(userId: string, ids: string[] | "all", now: Date) {
    let q = this.db
      .from("notifications")
      .update({ read_at: now.toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (ids !== "all") q = q.in("id", ids);
    const { data, error } = await q.select("id");
    fail("mark notifications read", error);
    return (data ?? []).length;
  }
  async createDeletionRequest(
    userId: string,
    v: { reason: string | null; notBefore: Date },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("deletion_requests")
      .insert({
        user_id: userId,
        reason: v.reason,
        requested_at: now.toISOString(),
        not_before: v.notBefore.toISOString(),
      })
      .select()
      .single();
    fail("create deletion request", error);
    return toDeletion(data);
  }
  async getPendingDeletion(userId: string) {
    const { data, error } = await this.db
      .from("deletion_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    fail("get pending deletion", error);
    return data ? toDeletion(data) : null;
  }
  async latestDeletion(userId: string) {
    const { data, error } = await this.db
      .from("deletion_requests")
      .select("*")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(1);
    fail("latest deletion", error);
    return data?.[0] ? toDeletion(data[0]) : null;
  }
  async getDeletion(id: string) {
    const { data, error } = await this.db
      .from("deletion_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail("get deletion", error);
    return data ? toDeletion(data) : null;
  }
  async listDeletions(status?: DeletionRequestRow["status"]) {
    let q = this.db.from("deletion_requests").select("*").order("requested_at");
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    fail("list deletions", error);
    return (data ?? []).map(toDeletion);
  }
  async resolveDeletion(
    id: string,
    patch: { status: "cancelled" | "fulfilled"; note: string | null; resolvedBy: string | null },
    now: Date,
  ) {
    const { data, error } = await this.db
      .from("deletion_requests")
      .update({
        status: patch.status,
        note: patch.note,
        resolved_by: patch.resolvedBy,
        resolved_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    fail("resolve deletion", error);
    return toDeletion(data);
  }
}
