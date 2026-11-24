import { z } from "zod";
import { curriculum } from "@buildapps/lessons";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type { Stores } from "./store";

const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new WorkspaceError("invalid", r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
};

async function requireAdmin(d: Deps, userId: string) {
  if (!(await d.stores.rescue.isAdmin(userId)))
    throw new WorkspaceError("forbidden", "Administrators only");
}

/** Every sensitive administrative action leaves an immutable audit entry. */
export async function audit(
  d: Deps,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown> = {},
) {
  await d.stores.ops.appendAudit({ actorId, action, targetType, targetId, detail }, nowOf(d));
}

/** Best-effort: a failed notification must never fail the action that caused it. */
export async function notify(
  d: Deps,
  userId: string,
  n: { kind: string; title: string; body?: string; link?: string },
) {
  try {
    await d.stores.ops.addNotification(userId, n, nowOf(d));
  } catch (e) {
    console.error("notification failed", e);
  }
}

/** Lessons an administrator has withheld from learners. */
export async function disabledLessonIds(stores: Stores): Promise<Set<string>> {
  return new Set(
    (await stores.ops.listContentFlags()).filter((f) => f.disabled).map((f) => f.lessonId),
  );
}

// ---------- user-facing ----------
const supportSchema = z.object({
  category: z.enum(["account", "learning", "project", "expert", "publishing", "other"]),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(4000),
});
const MAX_OPEN_SUPPORT = 5;
export async function createSupportRequest(d: Deps, userId: string, input: unknown) {
  const v = parse(supportSchema, input);
  const mine = await d.stores.ops.listSupportForUser(userId);
  if (
    mine.filter((s) => s.status === "open" || s.status === "in_progress").length >= MAX_OPEN_SUPPORT
  )
    throw new WorkspaceError(
      "rate_limited",
      "You have several open support requests already; wait for a reply first",
    );
  return d.stores.ops.createSupport(userId, v, nowOf(d));
}
export const listMySupport = (d: Deps, userId: string) => d.stores.ops.listSupportForUser(userId);

const reportSchema = z.object({
  targetType: z.enum(["user", "expert", "project", "request"]),
  targetId: z.string().trim().min(1).max(128),
  reason: z.enum(["spam", "harassment", "unsafe_content", "impersonation", "fraud", "other"]),
  detail: z.string().trim().max(2000).optional(),
});
const MAX_OPEN_REPORTS = 10;
export async function createAbuseReport(d: Deps, userId: string, input: unknown) {
  const v = parse(reportSchema, input);
  const open = (await d.stores.ops.listReports("open")).filter((r) => r.reporterId === userId);
  if (open.length >= MAX_OPEN_REPORTS)
    throw new WorkspaceError("rate_limited", "Too many open reports");
  return d.stores.ops.createReport(
    userId,
    { targetType: v.targetType, targetId: v.targetId, reason: v.reason, detail: v.detail ?? null },
    nowOf(d),
  );
}

export const listNotifications = (d: Deps, userId: string) =>
  d.stores.ops.listNotifications(userId, 50);
export async function markNotificationsRead(d: Deps, userId: string, input: unknown) {
  const v = parse(
    z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(64)).max(100)]) }),
    input,
  );
  return { updated: await d.stores.ops.markNotificationsRead(userId, v.ids, nowOf(d)) };
}

// ---------- admin ----------
export async function adminOverview(d: Deps, adminId: string) {
  await requireAdmin(d, adminId);
  const [counts, requests, pendingExperts] = await Promise.all([
    d.stores.ops.counts(),
    d.stores.rescue.listAllRequests(),
    d.stores.rescue.listExperts("pending"),
  ]);
  const byStatus: Record<string, number> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const publishingOpen = requests.filter(
    (r) => r.kind === "publishing" && !["completed", "cancelled"].includes(r.status),
  ).length;
  return {
    ...counts,
    pendingExperts: pendingExperts.length,
    requestsByStatus: byStatus,
    openPublishingAssistance: publishingOpen,
    awaitingMatch: byStatus.submitted ?? 0,
    lessons: curriculum.lessons.length,
  };
}

export async function adminListUsers(d: Deps, adminId: string, q?: string) {
  await requireAdmin(d, adminId);
  return d.stores.ops.listUsers(q?.slice(0, 60), 50);
}

export async function adminSetSuspension(d: Deps, adminId: string, userId: string, input: unknown) {
  await requireAdmin(d, adminId);
  const v = parse(
    z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).optional() }),
    input,
  );
  if (userId === adminId) throw new WorkspaceError("forbidden", "You cannot suspend yourself");
  if (await d.stores.rescue.isAdmin(userId))
    throw new WorkspaceError("forbidden", "Administrators cannot be suspended here");
  if (v.suspended && (v.reason?.length ?? 0) < 5)
    throw new WorkspaceError("invalid", "Record why you are suspending this account");
  const u = await d.stores.ops.getUser(userId);
  if (!u) throw new WorkspaceError("not_found", "User not found");
  await d.stores.ops.setSuspended(userId, v.suspended, v.reason ?? null, adminId, nowOf(d));
  if (v.suspended) {
    // access granted through the expert program ends with the account
    const expert = await d.stores.rescue.getExpertByUser(userId);
    if (expert) {
      for (const r of await d.stores.rescue.listRequestsForExpert(expert.id))
        await d.stores.rescue.revokeHandoffs(r.id, nowOf(d));
    }
  }
  await audit(d, adminId, v.suspended ? "user.suspend" : "user.reinstate", "user", userId, {
    reason: v.reason ?? null,
  });
  return (await d.stores.ops.getUser(userId))!;
}

export async function adminListSupport(d: Deps, adminId: string, status?: string) {
  await requireAdmin(d, adminId);
  const s = status
    ? z.enum(["open", "in_progress", "resolved", "closed"]).parse(status)
    : undefined;
  return d.stores.ops.listSupport(s);
}
export async function adminUpdateSupport(d: Deps, adminId: string, id: string, input: unknown) {
  await requireAdmin(d, adminId);
  const v = parse(
    z.object({
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
      note: z.string().trim().max(2000).optional(),
    }),
    input,
  );
  const row = await d.stores.ops.getSupport(id);
  if (!row) throw new WorkspaceError("not_found", "Support request not found");
  if ((row.status === "resolved" || row.status === "closed") && v.status === "open")
    throw new WorkspaceError(
      "conflict",
      "A finished request cannot be reopened by an administrator",
    );
  const updated = await d.stores.ops.updateSupport(
    id,
    { status: v.status, adminNote: v.note ?? row.adminNote, handledBy: adminId },
    nowOf(d),
  );
  await audit(d, adminId, "support.update", "support_request", id, {
    from: row.status,
    to: v.status,
  });
  if (v.status === "resolved" || v.status === "in_progress")
    await notify(d, row.userId, {
      kind: "support",
      title:
        v.status === "resolved"
          ? "Your support request was resolved"
          : "Support is looking at your request",
      body: row.subject,
      link: "/support",
    });
  return updated;
}

export async function adminListReports(d: Deps, adminId: string, status?: string) {
  await requireAdmin(d, adminId);
  const s = status ? z.enum(["open", "actioned", "dismissed"]).parse(status) : undefined;
  return d.stores.ops.listReports(s);
}
export async function adminReviewReport(d: Deps, adminId: string, id: string, input: unknown) {
  await requireAdmin(d, adminId);
  const v = parse(
    z.object({
      status: z.enum(["actioned", "dismissed"]),
      note: z.string().trim().min(5).max(2000),
    }),
    input,
  );
  const row = await d.stores.ops.getReport(id);
  if (!row) throw new WorkspaceError("not_found", "Report not found");
  if (row.status !== "open") throw new WorkspaceError("conflict", "Report was already reviewed");
  const updated = await d.stores.ops.reviewReport(
    id,
    { status: v.status, note: v.note, reviewedBy: adminId },
    nowOf(d),
  );
  await audit(d, adminId, "report.review", "abuse_report", id, {
    decision: v.status,
    targetType: row.targetType,
    targetId: row.targetId,
  });
  return updated;
}

export async function adminListAudit(d: Deps, adminId: string) {
  await requireAdmin(d, adminId);
  return d.stores.ops.listAudit(100);
}

export async function adminListContent(d: Deps, adminId: string) {
  await requireAdmin(d, adminId);
  const flags = new Map((await d.stores.ops.listContentFlags()).map((f) => [f.lessonId, f]));
  return curriculum.lessons.map((l) => ({
    id: l.id,
    title: l.title,
    skillId: l.skillId,
    exercises: l.exercises.length,
    disabled: flags.get(l.id)?.disabled ?? false,
    note: flags.get(l.id)?.note ?? null,
  }));
}
export async function adminSetLessonDisabled(
  d: Deps,
  adminId: string,
  lessonId: string,
  input: unknown,
) {
  await requireAdmin(d, adminId);
  const v = parse(
    z.object({ disabled: z.boolean(), note: z.string().trim().max(500).optional() }),
    input,
  );
  if (!curriculum.lessons.some((l) => l.id === lessonId))
    throw new WorkspaceError("not_found", "Lesson not found");
  if (v.disabled && (v.note?.length ?? 0) < 5)
    throw new WorkspaceError("invalid", "Record why this lesson is being withheld");
  const row = await d.stores.ops.setContentFlag(
    lessonId,
    v.disabled,
    v.note ?? null,
    adminId,
    nowOf(d),
  );
  await audit(d, adminId, v.disabled ? "lesson.disable" : "lesson.enable", "lesson", lessonId, {
    note: v.note ?? null,
  });
  return row;
}
