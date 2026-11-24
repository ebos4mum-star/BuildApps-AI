import { z } from "zod";
import { audit, notify } from "./ops-service";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type { DeletionRequestRow } from "./ops-types";

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

/** Time between asking for deletion and when erasure may be carried out; the request can be cancelled meanwhile. */
export const DELETION_COOLING_OFF_DAYS = 14;

/**
 * A portable copy of everything the caller's account holds. Built only from the caller's own records;
 * other people's data (for example an expert's private notes) is never included.
 */
export async function exportMyData(d: Deps, userId: string) {
  const [progress, projects, support, notifications, requests, deletion] = await Promise.all([
    d.stores.progress.load(userId, ""),
    d.stores.projects.list(userId),
    d.stores.ops.listSupportForUser(userId),
    d.stores.ops.listNotifications(userId, 500),
    d.stores.rescue.listRequestsForRequester(userId),
    d.stores.ops.latestDeletion(userId),
  ]);
  await audit(d, userId, "privacy.export", "user", userId);
  return {
    exportedAt: nowOf(d).toISOString(),
    account: { id: userId },
    learning: {
      totalXp: progress.totalXp,
      timeZone: progress.timeZone,
      streak: progress.streak,
      passedExerciseIds: [...progress.passedExerciseIds],
      achievements: [...progress.earnedAchievements],
      verifiedMilestones: progress.verifiedMilestones,
      verifiedProjectsCompleted: progress.verifiedProjectsCompleted,
    },
    projects,
    helpRequests: requests,
    support,
    notifications,
    deletionRequest: deletion,
  };
}

export async function myDeletionRequest(d: Deps, userId: string) {
  return d.stores.ops.getPendingDeletion(userId);
}

const requestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  /** Must be typed exactly so a stray tap cannot start a deletion. */
  confirm: z.literal("DELETE MY ACCOUNT"),
});
export async function requestAccountDeletion(d: Deps, userId: string, input: unknown) {
  const v = parse(requestSchema, input);
  if (await d.stores.ops.getPendingDeletion(userId))
    throw new WorkspaceError("conflict", "A deletion request is already pending");
  const now = nowOf(d);
  const notBefore = new Date(
    now.getTime() + (d.coolingOffDays ?? DELETION_COOLING_OFF_DAYS) * 86_400_000,
  );
  const row = await d.stores.ops.createDeletionRequest(
    userId,
    { reason: v.reason ?? null, notBefore },
    now,
  );
  await audit(d, userId, "privacy.deletion_requested", "user", userId, {
    notBefore: row.notBefore,
  });
  await notify(d, userId, {
    kind: "privacy",
    title: "Account deletion requested",
    body: `Your account can be erased after ${notBefore.toISOString().slice(0, 10)}. You can cancel any time before then.`,
    link: "/privacy",
  });
  return row;
}

export async function cancelAccountDeletion(d: Deps, userId: string) {
  const pending = await d.stores.ops.getPendingDeletion(userId);
  if (!pending) throw new WorkspaceError("not_found", "No pending deletion request");
  const row = await d.stores.ops.resolveDeletion(
    pending.id,
    { status: "cancelled", note: "Cancelled by the account holder", resolvedBy: userId },
    nowOf(d),
  );
  await audit(d, userId, "privacy.deletion_cancelled", "user", userId);
  return row;
}

export async function adminListDeletions(d: Deps, adminId: string, status?: string) {
  await requireAdmin(d, adminId);
  const s = parse(z.enum(["pending", "cancelled", "fulfilled"]).optional(), status);
  return d.stores.ops.listDeletions(s);
}

/**
 * Records that an operator has erased the account (runbook in docs/PRIVACY.md). It refuses before the
 * cooling-off ends, so even a compromised admin session cannot rush an erasure. The erasure itself is a
 * deliberate, separate, destructive operation and is NOT performed by this call.
 */
export async function adminRecordErasure(
  d: Deps,
  adminId: string,
  id: string,
  input: unknown,
): Promise<DeletionRequestRow> {
  await requireAdmin(d, adminId);
  const v = parse(z.object({ note: z.string().trim().min(5).max(500) }), input);
  const row = await d.stores.ops.getDeletion(id);
  if (!row) throw new WorkspaceError("not_found", "Deletion request not found");
  if (row.status !== "pending") throw new WorkspaceError("conflict", `Request is ${row.status}`);
  if (Date.parse(row.notBefore) > nowOf(d).getTime())
    throw new WorkspaceError("conflict", "The cooling-off period has not ended");
  const out = await d.stores.ops.resolveDeletion(
    id,
    { status: "fulfilled", note: v.note, resolvedBy: adminId },
    nowOf(d),
  );
  await audit(d, adminId, "privacy.erasure_recorded", "user", row.userId, { requestId: id });
  return out;
}
