import { toDayKey } from "./dates";

/** Provider-independent notification model. Nothing here knows about any push or email vendor. */
export const NOTIFICATION_CHANNELS = ["in_app", "push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
  "learning_reminder",
  "weekly_summary",
  "project",
  "support",
  "expert",
  "publishing",
  "security",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Categories the user may not switch off in the app (account-safety messages). */
export const ALWAYS_ON: readonly NotificationCategory[] = ["security"];

export interface NotificationPrefs {
  push: boolean;
  email: boolean;
  categories: Record<NotificationCategory, boolean>;
  /** Local hours during which push is held back, e.g. 22 to 7. null = no quiet hours. */
  quietHours: { start: number; end: number } | null;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  push: false,
  email: false,
  categories: {
    learning_reminder: true,
    weekly_summary: true,
    project: true,
    support: true,
    expert: true,
    publishing: true,
    security: true,
  },
  quietHours: { start: 22, end: 7 },
};

/** Maps the free-text `kind` used by in-app notifications onto a category. */
export function categoryOfKind(kind: string): NotificationCategory {
  if (kind === "support" || kind === "report") return "support";
  if (kind === "expert" || kind === "request" || kind === "handoff") return "expert";
  if (kind === "publishing") return "publishing";
  if (kind === "privacy" || kind === "security" || kind === "account") return "security";
  if (kind === "project" || kind === "scan" || kind === "milestone") return "project";
  if (kind === "reminder") return "learning_reminder";
  if (kind === "weekly") return "weekly_summary";
  return "project";
}

export function parsePrefs(
  input: unknown,
): { ok: true; prefs: NotificationPrefs } | { ok: false; message: string } {
  const o = (input && typeof input === "object" ? input : null) as Record<string, unknown> | null;
  if (!o) return { ok: false, message: "Send your notification preferences" };
  if (typeof o.push !== "boolean" || typeof o.email !== "boolean")
    return { ok: false, message: "push and email must be true or false" };
  const cats = o.categories as Record<string, unknown> | undefined;
  const categories = { ...DEFAULT_PREFS.categories };
  for (const c of NOTIFICATION_CATEGORIES) {
    const v = cats?.[c];
    if (v === undefined) continue;
    if (typeof v !== "boolean") return { ok: false, message: `${c} must be true or false` };
    categories[c] = ALWAYS_ON.includes(c) ? true : v;
  }
  let quietHours: NotificationPrefs["quietHours"] = null;
  if (o.quietHours !== null && o.quietHours !== undefined) {
    const q = o.quietHours as Record<string, unknown>;
    const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 23;
    if (!ok(q.start) || !ok(q.end)) return { ok: false, message: "Quiet hours must be hours 0-23" };
    quietHours = { start: q.start as number, end: q.end as number };
  }
  return { ok: true, prefs: { push: o.push, email: o.email, categories, quietHours } };
}

export function inQuietHours(q: NotificationPrefs["quietHours"], now: Date, tz: string): boolean {
  if (!q || q.start === q.end) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(
      now,
    ),
  );
  return q.start < q.end ? hour >= q.start && hour < q.end : hour >= q.start || hour < q.end;
}

export type Delivery = { send: true } | { send: false; reason: string };

/**
 * Whether one message may go out on one channel right now. In-app messages are always stored. Push and email
 * need the channel switched on, the category on, and (push only) to be outside quiet hours.
 */
export function shouldDeliver(
  prefs: NotificationPrefs,
  category: NotificationCategory,
  channel: NotificationChannel,
  now: Date,
  tz: string,
): Delivery {
  if (channel === "in_app") return { send: true };
  if (!prefs.categories[category] && !ALWAYS_ON.includes(category))
    return { send: false, reason: "category_off" };
  if (channel === "push" && !prefs.push) return { send: false, reason: "push_off" };
  if (channel === "email" && !prefs.email) return { send: false, reason: "email_off" };
  if (channel === "push" && category !== "security" && inQuietHours(prefs.quietHours, now, tz))
    return { send: false, reason: "quiet_hours" };
  return { send: true };
}

/** Local hour of day (0-23) in a time zone. */
export function localHour(now: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(
      now,
    ),
  );
}
/** ISO-ish week key (year-week-of-year by Monday) so weekly messages are sent once per week. */
export function weekKey(now: Date, tz: string): string {
  const day = toDayKey(now, tz);
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
