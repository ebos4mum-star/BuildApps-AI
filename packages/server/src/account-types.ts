import type { NotificationChannel, NotificationPrefs } from "@buildapps/core";

export interface AccountInfo {
  displayName: string | null;
  timeZone: string;
}
export interface DeviceRow {
  id: string;
  platform: "ios" | "android" | "web";
  token: string;
  createdAt: string;
  lastSeenAt: string;
}
export type OutboxStatus = "pending" | "sent" | "failed" | "skipped";
export interface OutboxRow {
  id: string;
  userId: string;
  channel: Exclude<NotificationChannel, "in_app">;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupeKey: string | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  sendAfter: string;
  createdAt: string;
  sentAt: string | null;
}
export interface OutboxStats {
  pending: number;
  failed: number;
  sentLast24h: number;
  skippedLast24h: number;
  oldestPendingMinutes: number | null;
}
export interface ReminderCandidate {
  userId: string;
  timeZone: string;
  hour: number;
}

/** Persistence port for account settings, notification delivery and account erasure. */
export interface AccountStore {
  getAccount(userId: string): Promise<AccountInfo | null>;
  updateAccount(userId: string, v: AccountInfo): Promise<AccountInfo>;

  getPrefs(userId: string): Promise<NotificationPrefs | null>;
  savePrefs(userId: string, prefs: NotificationPrefs, now: Date): Promise<void>;

  addDevice(
    userId: string,
    v: { platform: DeviceRow["platform"]; token: string },
    now: Date,
  ): Promise<void>;
  removeDevice(userId: string, token: string): Promise<void>;
  listDevices(userId: string): Promise<DeviceRow[]>;

  /** Idempotent when `dedupeKey` is set: a repeat returns "duplicate" and creates nothing. */
  enqueue(
    item: {
      userId: string;
      channel: OutboxRow["channel"];
      category: string;
      title: string;
      body?: string | null;
      link?: string | null;
      dedupeKey?: string | null;
      sendAfter?: Date;
    },
    now: Date,
  ): Promise<"queued" | "duplicate">;
  listDue(now: Date, limit: number): Promise<OutboxRow[]>;
  markOutbox(
    id: string,
    patch: { status: OutboxStatus; attempts: number; error?: string | null; sendAfter?: Date },
    now: Date,
  ): Promise<void>;
  outboxStats(now: Date): Promise<OutboxStats>;
  listOutboxForUser(userId: string, limit: number): Promise<OutboxRow[]>;

  listReminderCandidates(limit: number): Promise<ReminderCandidate[]>;
  /** Users who switched on push or email, with their time zone (for weekly summaries). */
  listOptedInUsers(limit: number): Promise<{ userId: string; timeZone: string }[]>;
  /** The sign-in email, for the email channel. Never exposed to clients. */
  getEmail(userId: string): Promise<string | null>;

  /**
   * Permanently deletes the user and everything they own. Irreversible: callers must have verified the
   * cooling-off period and recorded an audit entry first. Audit rows keep their content with the actor removed.
   */
  eraseUser(userId: string): Promise<void>;
}
