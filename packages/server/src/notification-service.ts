import {
  DEFAULT_PREFS,
  categoryOfKind,
  dailyGoal,
  localHour,
  shouldDeliver,
  toDayKey,
  weekKey,
  weeklySummary,
  type NotificationCategory,
  type NotificationPrefs,
} from "@buildapps/core";
import { nowOf, type Deps } from "./deps";
import type { OutboxRow } from "./account-types";

/** What a delivery vendor must implement. Nothing in the app depends on a specific vendor. */
export type ProviderResult =
  { ok: true } | { ok: false; retryable: boolean; error: string; invalidToken?: boolean };
export interface PushProvider {
  readonly name: string;
  send(msg: {
    token: string;
    platform: string;
    title: string;
    body: string | null;
    link: string | null;
  }): Promise<ProviderResult>;
}
export interface EmailProvider {
  readonly name: string;
  send(msg: { to: string; subject: string; text: string }): Promise<ProviderResult>;
}
export interface NotificationProviders {
  push?: PushProvider;
  email?: EmailProvider;
}

export const MAX_ATTEMPTS = 5;
const backoffMs = (attempts: number) => Math.min(60, 2 ** attempts) * 60_000;

async function prefsOf(d: Deps, userId: string): Promise<NotificationPrefs> {
  return (await d.stores.account.getPrefs(userId)) ?? DEFAULT_PREFS;
}

/**
 * Queues the push/email copies of a notification according to the user's preferences. Best effort: it can
 * never fail the action that caused the notification. Delivery happens later in dispatchOutbox().
 */
export async function fanOut(
  d: Deps,
  userId: string,
  n: { kind: string; title: string; body?: string; link?: string },
  opts: { dedupeKey?: string; category?: NotificationCategory } = {},
) {
  try {
    const category = opts.category ?? categoryOfKind(n.kind);
    const prefs = await prefsOf(d, userId);
    const acct = await d.stores.account.getAccount(userId);
    for (const channel of ["push", "email"] as const) {
      const verdict = shouldDeliver(prefs, category, channel, nowOf(d), acct?.timeZone ?? "UTC");
      // quiet hours only delay: re-check happens at dispatch time
      if (!verdict.send && verdict.reason !== "quiet_hours") continue;
      await d.stores.account.enqueue(
        {
          userId,
          channel,
          category,
          title: n.title,
          body: n.body ?? null,
          link: n.link ?? null,
          dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${channel}` : null,
        },
        nowOf(d),
      );
    }
  } catch (e) {
    console.error("notification fan-out failed", e);
  }
}

export interface DispatchReport {
  processed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
}

async function deliverOne(d: Deps, providers: NotificationProviders, row: OutboxRow, now: Date) {
  const acct = await d.stores.account.getAccount(row.userId);
  const prefs = await prefsOf(d, row.userId);
  const verdict = shouldDeliver(
    prefs,
    row.category as NotificationCategory,
    row.channel,
    now,
    acct?.timeZone ?? "UTC",
  );
  if (!verdict.send) {
    // quiet hours hold the message until they end; any other reason drops it
    if (verdict.reason === "quiet_hours") return { status: "pending" as const, hold: true };
    return { status: "skipped" as const, error: verdict.reason };
  }
  if (row.channel === "push") {
    if (!providers.push) return { status: "skipped" as const, error: "provider_not_configured" };
    const devices = await d.stores.account.listDevices(row.userId);
    if (devices.length === 0) return { status: "skipped" as const, error: "no_device" };
    let ok = false;
    let last: ProviderResult | null = null;
    for (const dev of devices) {
      const r = await providers.push.send({
        token: dev.token,
        platform: dev.platform,
        title: row.title,
        body: row.body,
        link: row.link,
      });
      last = r;
      if (r.ok) ok = true;
      else if (r.invalidToken) await d.stores.account.removeDevice(row.userId, dev.token);
    }
    if (ok) return { status: "sent" as const };
    return last && !last.ok && last.retryable
      ? { status: "retry" as const, error: last.error }
      : { status: "failed" as const, error: last && !last.ok ? last.error : "no result" };
  }
  if (!providers.email) return { status: "skipped" as const, error: "provider_not_configured" };
  const to = await d.stores.account.getEmail(row.userId);
  if (!to) return { status: "skipped" as const, error: "no_email" };
  const text =
    [row.body, row.link ? `Open: ${row.link}` : null].filter(Boolean).join("\n\n") || row.title;
  const r = await providers.email.send({ to, subject: row.title, text });
  if (r.ok) return { status: "sent" as const };
  return r.retryable
    ? { status: "retry" as const, error: r.error }
    : { status: "failed" as const, error: r.error };
}

/** Works through due messages. Safe to call repeatedly (a scheduler, or manually); missing providers skip, never fake success. */
export async function dispatchOutbox(
  d: Deps,
  providers: NotificationProviders,
  limit = 50,
): Promise<DispatchReport> {
  const now = nowOf(d);
  const report: DispatchReport = { processed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  for (const row of await d.stores.account.listDue(now, limit)) {
    report.processed++;
    let out;
    try {
      out = await deliverOne(d, providers, row, now);
    } catch (e) {
      out = { status: "retry" as const, error: e instanceof Error ? e.message : "delivery error" };
    }
    if ("hold" in out) {
      // postpone one hour at a time until quiet hours are over
      await d.stores.account.markOutbox(
        row.id,
        {
          status: "pending",
          attempts: row.attempts,
          sendAfter: new Date(now.getTime() + 3_600_000),
        },
        now,
      );
      continue;
    }
    if (out.status === "retry") {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await d.stores.account.markOutbox(
          row.id,
          { status: "failed", attempts, error: out.error },
          now,
        );
        report.failed++;
      } else {
        await d.stores.account.markOutbox(
          row.id,
          {
            status: "pending",
            attempts,
            error: out.error,
            sendAfter: new Date(now.getTime() + backoffMs(attempts)),
          },
          now,
        );
        report.retried++;
      }
      continue;
    }
    const attempts = row.attempts + (out.status === "sent" || out.status === "failed" ? 1 : 0);
    await d.stores.account.markOutbox(
      row.id,
      { status: out.status, attempts, error: "error" in out ? out.error : null },
      now,
    );
    if (out.status === "sent") report.sent++;
    else if (out.status === "skipped") report.skipped++;
    else report.failed++;
  }
  return report;
}

/** Practice reminders: once per local day, only at the user's chosen hour, only if they have not practised today. */
export async function enqueueDueReminders(d: Deps, limit = 500) {
  const now = nowOf(d);
  let queued = 0;
  for (const c of await d.stores.account.listReminderCandidates(limit)) {
    if (localHour(now, c.timeZone) !== c.hour) continue;
    const state = await d.stores.progress.load(c.userId, "");
    if (dailyGoal(state.recentExerciseAwards, "light", now, c.timeZone).todayXp > 0) continue;
    const day = toDayKey(now, c.timeZone);
    const before = (await d.stores.account.listOutboxForUser(c.userId, 100)).length;
    await fanOut(
      d,
      c.userId,
      {
        kind: "reminder",
        title: "Time for a quick practice",
        body: "One short exercise keeps your skills fresh. Your progress is waiting.",
        link: "/learn",
      },
      { dedupeKey: `reminder:${c.userId}:${day}`, category: "learning_reminder" },
    );
    const after = (await d.stores.account.listOutboxForUser(c.userId, 100)).length;
    if (after > before) queued++;
  }
  return { queued };
}

/** A calm weekly recap, once per week (Mondays, 09:00 local), only for people who opted in to push or email. */
export async function enqueueWeeklySummaries(d: Deps, limit = 500) {
  const now = nowOf(d);
  let queued = 0;
  for (const u of await d.stores.account.listOptedInUsers(limit)) {
    const local = new Date(`${toDayKey(now, u.timeZone)}T00:00:00Z`);
    if (local.getUTCDay() !== 1 || localHour(now, u.timeZone) !== 9) continue;
    const state = await d.stores.progress.load(u.userId, "");
    const w = weeklySummary(state.recentExerciseAwards, now, u.timeZone);
    const before = (await d.stores.account.listOutboxForUser(u.userId, 100)).length;
    await fanOut(
      d,
      u.userId,
      {
        kind: "weekly",
        title: "Your week in BuildApps",
        body:
          w.activeDays === 0
            ? "A quiet week. Whenever you are ready, one short lesson is a great restart."
            : `You earned ${w.xp} XP over ${w.activeDays} active ${w.activeDays === 1 ? "day" : "days"}. Nice work.`,
        link: "/learn",
      },
      { dedupeKey: `weekly:${u.userId}:${weekKey(now, u.timeZone)}`, category: "weekly_summary" },
    );
    if ((await d.stores.account.listOutboxForUser(u.userId, 100)).length > before) queued++;
  }
  return { queued };
}
