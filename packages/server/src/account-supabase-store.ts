import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PREFS, type NotificationPrefs } from "@buildapps/core";
import type {
  AccountInfo,
  AccountStore,
  DeviceRow,
  OutboxRow,
  OutboxStats,
  ReminderCandidate,
} from "./account-types";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw PostgREST rows
function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}
const toOutbox = (r: R): OutboxRow => ({
  id: r.id,
  userId: r.user_id,
  channel: r.channel,
  category: r.category,
  title: r.title,
  body: r.body,
  link: r.link,
  dedupeKey: r.dedupe_key,
  status: r.status,
  attempts: r.attempts,
  lastError: r.last_error,
  sendAfter: r.send_after,
  createdAt: r.created_at,
  sentAt: r.sent_at,
});

export class SupabaseAccountStore implements AccountStore {
  constructor(private readonly db: SupabaseClient) {}

  async getAccount(userId: string) {
    const { data, error } = await this.db
      .from("profiles")
      .select("display_name, timezone")
      .eq("id", userId)
      .maybeSingle();
    fail("get account", error);
    return data ? { displayName: data.display_name, timeZone: data.timezone } : null;
  }
  async updateAccount(userId: string, v: AccountInfo) {
    const { data, error } = await this.db
      .from("profiles")
      .update({ display_name: v.displayName, timezone: v.timeZone })
      .eq("id", userId)
      .select("display_name, timezone")
      .single();
    fail("update account", error);
    return { displayName: data.display_name, timeZone: data.timezone };
  }

  async getPrefs(userId: string) {
    const { data, error } = await this.db
      .from("notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    fail("get prefs", error);
    if (!data) return null;
    return {
      push: data.push,
      email: data.email,
      categories: { ...DEFAULT_PREFS.categories, ...(data.categories ?? {}) },
      quietHours:
        data.quiet_start === null ? null : { start: data.quiet_start, end: data.quiet_end },
    } as NotificationPrefs;
  }
  async savePrefs(userId: string, p: NotificationPrefs, now: Date) {
    const { error } = await this.db.from("notification_prefs").upsert(
      {
        user_id: userId,
        push: p.push,
        email: p.email,
        categories: p.categories,
        quiet_start: p.quietHours?.start ?? null,
        quiet_end: p.quietHours?.end ?? null,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );
    fail("save prefs", error);
  }

  async addDevice(
    userId: string,
    v: { platform: DeviceRow["platform"]; token: string },
    now: Date,
  ) {
    const { error } = await this.db
      .from("device_tokens")
      .upsert(
        { user_id: userId, platform: v.platform, token: v.token, last_seen_at: now.toISOString() },
        { onConflict: "user_id,token" },
      );
    fail("add device", error);
  }
  async removeDevice(userId: string, token: string) {
    const { error } = await this.db
      .from("device_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", token);
    fail("remove device", error);
  }
  async listDevices(userId: string) {
    const { data, error } = await this.db.from("device_tokens").select("*").eq("user_id", userId);
    fail("list devices", error);
    return (data ?? []).map((d) => ({
      id: d.id,
      platform: d.platform,
      token: d.token,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
    }));
  }

  async enqueue(item: Parameters<AccountStore["enqueue"]>[0], now: Date) {
    const { error } = await this.db.from("notification_outbox").insert({
      user_id: item.userId,
      channel: item.channel,
      category: item.category,
      title: item.title,
      body: item.body ?? null,
      link: item.link ?? null,
      dedupe_key: item.dedupeKey ?? null,
      send_after: (item.sendAfter ?? now).toISOString(),
      created_at: now.toISOString(),
    });
    if (error?.code === "23505") return "duplicate"; // unique dedupe_key
    fail("enqueue", error);
    return "queued";
  }
  async listDue(now: Date, limit: number) {
    const { data, error } = await this.db
      .from("notification_outbox")
      .select("*")
      .eq("status", "pending")
      .lte("send_after", now.toISOString())
      .order("send_after")
      .limit(limit);
    fail("list due", error);
    return (data ?? []).map(toOutbox);
  }
  async markOutbox(
    id: string,
    patch: {
      status: OutboxRow["status"];
      attempts: number;
      error?: string | null;
      sendAfter?: Date;
    },
    now: Date,
  ) {
    const { error } = await this.db
      .from("notification_outbox")
      .update({
        status: patch.status,
        attempts: patch.attempts,
        last_error: patch.error?.slice(0, 300) ?? null,
        ...(patch.sendAfter ? { send_after: patch.sendAfter.toISOString() } : {}),
        ...(patch.status === "sent" ? { sent_at: now.toISOString() } : {}),
      })
      .eq("id", id);
    fail("mark outbox", error);
  }
  async outboxStats(now: Date): Promise<OutboxStats> {
    const day = new Date(now.getTime() - 86_400_000).toISOString();
    const head = () =>
      this.db.from("notification_outbox").select("id", { count: "exact", head: true });
    const [pending, failed, sent, skipped, oldest] = await Promise.all([
      head().eq("status", "pending"),
      head().eq("status", "failed"),
      head().eq("status", "sent").gte("sent_at", day),
      head().eq("status", "skipped").gte("created_at", day),
      this.db
        .from("notification_outbox")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at")
        .limit(1),
    ]);
    for (const r of [pending, failed, sent, skipped, oldest]) fail("outbox stats", r.error);
    const o = oldest.data?.[0]?.created_at as string | undefined;
    return {
      pending: pending.count ?? 0,
      failed: failed.count ?? 0,
      sentLast24h: sent.count ?? 0,
      skippedLast24h: skipped.count ?? 0,
      oldestPendingMinutes: o ? Math.floor((now.getTime() - Date.parse(o)) / 60_000) : null,
    };
  }
  async listOutboxForUser(userId: string, limit: number) {
    const { data, error } = await this.db
      .from("notification_outbox")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    fail("list outbox", error);
    return (data ?? []).map(toOutbox);
  }

  async listReminderCandidates(limit: number): Promise<ReminderCandidate[]> {
    const { data, error } = await this.db
      .from("learner_profiles")
      .select("user_id, reminder_hour")
      .eq("reminders_enabled", true)
      .limit(limit);
    fail("reminder candidates", error);
    const ids = (data ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return [];
    const tz = await this.db.from("profiles").select("id, timezone").in("id", ids);
    fail("reminder timezones", tz.error);
    const zone = new Map((tz.data ?? []).map((p) => [p.id as string, p.timezone as string]));
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      hour: r.reminder_hour,
      timeZone: zone.get(r.user_id) ?? "UTC",
    }));
  }
  async listOptedInUsers(limit: number) {
    const { data, error } = await this.db
      .from("notification_prefs")
      .select("user_id")
      .or("push.eq.true,email.eq.true")
      .limit(limit);
    fail("opted-in users", error);
    const ids = (data ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return [];
    const tz = await this.db.from("profiles").select("id, timezone").in("id", ids);
    fail("opted-in timezones", tz.error);
    const zone = new Map((tz.data ?? []).map((p) => [p.id as string, p.timezone as string]));
    return ids.map((userId) => ({ userId, timeZone: zone.get(userId) ?? "UTC" }));
  }
  async getEmail(userId: string) {
    const { data, error } = await this.db.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
  }

  async eraseUser(userId: string) {
    // foreign keys cascade everything the user owns; admin_audit keeps rows with the actor removed
    const { error } = await this.db.auth.admin.deleteUser(userId);
    fail("erase user", error);
  }
}
