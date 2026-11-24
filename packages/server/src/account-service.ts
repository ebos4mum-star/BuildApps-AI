import { z } from "zod";
import { assertValidTimeZone, DEFAULT_PREFS, parsePrefs } from "@buildapps/core";
import { audit, notify } from "./ops-service";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";

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

export async function getAccountView(d: Deps, userId: string) {
  const [account, prefs, devices] = await Promise.all([
    d.stores.account.getAccount(userId),
    d.stores.account.getPrefs(userId),
    d.stores.account.listDevices(userId),
  ]);
  return {
    account: account ?? { displayName: null, timeZone: "UTC" },
    notifications: prefs ?? DEFAULT_PREFS,
    /** Tokens are credentials; only counts and platforms leave the server. */
    devices: devices.map((x) => ({ id: x.id, platform: x.platform, registeredAt: x.createdAt })),
    providers: {
      push: d.notifications?.push?.name ?? null,
      email: d.notifications?.email?.name ?? null,
    },
  };
}

const accountSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(60, "Keep your name to 60 characters")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  timeZone: z.string().trim().min(1).max(64),
});
export async function updateAccount(d: Deps, userId: string, input: unknown) {
  const v = parse(accountSchema, input);
  try {
    assertValidTimeZone(v.timeZone);
  } catch {
    throw new WorkspaceError("invalid", "That time zone is not recognised");
  }
  const row = await d.stores.account.updateAccount(userId, v);
  await audit(d, userId, "account.update", "user", userId, { fields: ["displayName", "timeZone"] });
  return row;
}

export async function saveNotificationPrefs(d: Deps, userId: string, input: unknown) {
  const r = parsePrefs(input);
  if (!r.ok) throw new WorkspaceError("invalid", r.message);
  await d.stores.account.savePrefs(userId, r.prefs, nowOf(d));
  return r.prefs;
}

const MAX_DEVICES = 10;
const deviceSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  token: z
    .string()
    .trim()
    .min(8)
    .max(500)
    .regex(/^[A-Za-z0-9_\-:.[\]=+/]+$/, "Unrecognised token format"),
});
export async function registerDevice(d: Deps, userId: string, input: unknown) {
  const v = parse(deviceSchema, input);
  const have = await d.stores.account.listDevices(userId);
  if (!have.some((x) => x.token === v.token) && have.length >= MAX_DEVICES)
    throw new WorkspaceError("conflict", "Too many registered devices; remove one first");
  await d.stores.account.addDevice(userId, v, nowOf(d));
}
export async function unregisterDevice(d: Deps, userId: string, input: unknown) {
  const v = parse(z.object({ token: z.string().trim().min(8).max(500) }), input);
  await d.stores.account.removeDevice(userId, v.token);
}

/**
 * Permanently erases an account. This is the only code path that does so, and it is deliberately hard to reach:
 * disabled unless `allowErasure`, admin-only, cooling-off enforced, typed account id, never an administrator,
 * never someone with expert work in flight. The audit entry is written FIRST, because the request record itself
 * is erased with the account.
 */
export async function adminExecuteErasure(
  d: Deps,
  adminId: string,
  requestId: string,
  input: unknown,
) {
  await requireAdmin(d, adminId);
  if (!d.allowErasure)
    throw new WorkspaceError("unavailable", "Account erasure is not enabled on this server");
  const v = parse(z.object({ confirmUserId: z.string().min(1) }), input);
  const req = await d.stores.ops.getDeletion(requestId);
  if (!req) throw new WorkspaceError("not_found", "Deletion request not found");
  if (req.status !== "pending") throw new WorkspaceError("conflict", `Request is ${req.status}`);
  if (Date.parse(req.notBefore) > nowOf(d).getTime())
    throw new WorkspaceError("conflict", "The cooling-off period has not ended");
  if (v.confirmUserId !== req.userId)
    throw new WorkspaceError("invalid", "Type the account id exactly to confirm");
  if (req.userId === adminId)
    throw new WorkspaceError("forbidden", "Administrators cannot erase their own account here");
  if (await d.stores.rescue.isAdmin(req.userId))
    throw new WorkspaceError(
      "forbidden",
      "Remove administrator access before erasing this account",
    );
  const open = (await d.stores.rescue.listRequestsForRequester(req.userId)).filter((r) =>
    ["matched", "in_progress", "delivered"].includes(r.status),
  );
  if (open.length > 0)
    throw new WorkspaceError(
      "conflict",
      "The account has expert work in progress; resolve it first",
    );
  await audit(d, adminId, "privacy.erasure_executed", "user", req.userId, {
    requestId,
    requestedAt: req.requestedAt,
  });
  await d.stores.account.eraseUser(req.userId);
  return { erased: true as const, userId: req.userId };
}

/** Tells a user their data is being handled; used by flows that need an in-app trail. */
export async function noticeToUser(d: Deps, userId: string, title: string, body: string) {
  await notify(d, userId, { kind: "account", title, body, link: "/settings" });
}
