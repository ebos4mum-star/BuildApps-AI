import { randomUUID } from "node:crypto";
import type { NotificationPrefs } from "@buildapps/core";
import type { MemoryDb } from "./memory-store";
import type { MemoryOpsStore } from "./ops-memory-store";
import type {
  AccountInfo,
  AccountStore,
  DeviceRow,
  OutboxRow,
  OutboxStats,
  ReminderCandidate,
} from "./account-types";

export class MemoryAccountStore implements AccountStore {
  accounts = new Map<string, AccountInfo>();
  prefs = new Map<string, NotificationPrefs>();
  devices = new Map<string, (DeviceRow & { userId: string })[]>();
  outbox: OutboxRow[] = [];
  emails = new Map<string, string>();
  erased = new Set<string>();
  constructor(
    private db: MemoryDb,
    private ops: MemoryOpsStore,
  ) {}

  async getAccount(userId: string) {
    return (
      this.accounts.get(userId) ?? {
        displayName: userId.startsWith("dev:") ? userId.slice(4) : null,
        timeZone: this.db.users.get(userId)?.timeZone ?? "UTC",
      }
    );
  }
  async updateAccount(userId: string, v: AccountInfo) {
    this.accounts.set(userId, { ...v });
    const row = this.db.users.get(userId);
    if (row) row.timeZone = v.timeZone;
    return { ...v };
  }
  async getPrefs(userId: string) {
    const p = this.prefs.get(userId);
    return p ? structuredClone(p) : null;
  }
  async savePrefs(userId: string, p: NotificationPrefs) {
    this.prefs.set(userId, structuredClone(p));
  }
  async addDevice(
    userId: string,
    v: { platform: DeviceRow["platform"]; token: string },
    now: Date,
  ) {
    const list = this.devices.get(userId) ?? [];
    const hit = list.find((d) => d.token === v.token);
    if (hit) hit.lastSeenAt = now.toISOString();
    else
      list.push({
        id: randomUUID(),
        userId,
        platform: v.platform,
        token: v.token,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      });
    this.devices.set(userId, list);
  }
  async removeDevice(userId: string, token: string) {
    this.devices.set(
      userId,
      (this.devices.get(userId) ?? []).filter((d) => d.token !== token),
    );
  }
  async listDevices(userId: string) {
    return (this.devices.get(userId) ?? []).map(({ userId: _u, ...d }) => d);
  }

  async enqueue(item: Parameters<AccountStore["enqueue"]>[0], now: Date) {
    if (item.dedupeKey && this.outbox.some((o) => o.dedupeKey === item.dedupeKey))
      return "duplicate";
    this.outbox.push({
      id: randomUUID(),
      userId: item.userId,
      channel: item.channel,
      category: item.category,
      title: item.title,
      body: item.body ?? null,
      link: item.link ?? null,
      dedupeKey: item.dedupeKey ?? null,
      status: "pending",
      attempts: 0,
      lastError: null,
      sendAfter: (item.sendAfter ?? now).toISOString(),
      createdAt: now.toISOString(),
      sentAt: null,
    });
    return "queued";
  }
  async listDue(now: Date, limit: number) {
    return this.outbox
      .filter((o) => o.status === "pending" && Date.parse(o.sendAfter) <= now.getTime())
      .sort((a, b) => a.sendAfter.localeCompare(b.sendAfter))
      .slice(0, limit)
      .map((o) => ({ ...o }));
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
    const o = this.outbox.find((x) => x.id === id)!;
    o.status = patch.status;
    o.attempts = patch.attempts;
    o.lastError = patch.error ?? null;
    if (patch.sendAfter) o.sendAfter = patch.sendAfter.toISOString();
    if (patch.status === "sent") o.sentAt = now.toISOString();
  }
  async outboxStats(now: Date): Promise<OutboxStats> {
    const day = now.getTime() - 86_400_000;
    const pending = this.outbox.filter((o) => o.status === "pending");
    const oldest = pending.map((o) => Date.parse(o.createdAt)).sort((a, b) => a - b)[0];
    return {
      pending: pending.length,
      failed: this.outbox.filter((o) => o.status === "failed").length,
      sentLast24h: this.outbox.filter((o) => o.status === "sent" && Date.parse(o.sentAt!) >= day)
        .length,
      skippedLast24h: this.outbox.filter(
        (o) => o.status === "skipped" && Date.parse(o.createdAt) >= day,
      ).length,
      oldestPendingMinutes:
        oldest === undefined ? null : Math.floor((now.getTime() - oldest) / 60_000),
    };
  }
  async listOutboxForUser(userId: string, limit: number) {
    return this.outbox
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }
  async listReminderCandidates(limit: number): Promise<ReminderCandidate[]> {
    return [...this.db.profiles.rows.entries()]
      .filter(([, r]) => r.profile.reminders.enabled)
      .slice(0, limit)
      .map(([userId, r]) => ({
        userId,
        hour: r.profile.reminders.hour,
        timeZone:
          this.db.users.get(userId)?.timeZone ?? this.accounts.get(userId)?.timeZone ?? "UTC",
      }));
  }
  async listOptedInUsers(limit: number) {
    return [...this.prefs.entries()]
      .filter(([, p]) => p.push || p.email)
      .slice(0, limit)
      .map(([userId]) => ({
        userId,
        timeZone:
          this.db.users.get(userId)?.timeZone ?? this.accounts.get(userId)?.timeZone ?? "UTC",
      }));
  }
  async getEmail(userId: string) {
    return this.emails.get(userId) ?? null;
  }

  async eraseUser(userId: string) {
    const db = this.db;
    const projectIds = new Set(
      [...db.projects.values()].filter((p) => p.ownerId === userId).map((p) => p.id),
    );
    for (const id of projectIds) {
      db.projects.delete(id);
      db.projectLinks.delete(id);
    }
    for (const [id, s] of db.scans) if (projectIds.has(s.projectId)) db.scans.delete(id);
    for (const [id, f] of db.findings) if (projectIds.has(f.projectId)) db.findings.delete(id);
    db.verifications = db.verifications.filter((v) => !projectIds.has(v.projectId));
    const requestIds = new Set(
      [...db.requests.values()]
        .filter((r) => r.requesterId === userId || projectIds.has(r.projectId))
        .map((r) => r.id),
    );
    for (const id of requestIds) db.requests.delete(id);
    for (const [id, h] of db.handoffs)
      if (requestIds.has(h.serviceRequestId) || projectIds.has(h.projectId)) db.handoffs.delete(id);
    for (const [id, j] of db.jobs) if (requestIds.has(j.serviceRequestId)) db.jobs.delete(id);
    db.events = db.events.filter((e) => !requestIds.has(e.serviceRequestId));
    const targetIds = new Set(
      [...db.pubTargets.values()].filter((t) => projectIds.has(t.projectId)).map((t) => t.id),
    );
    for (const id of targetIds) db.pubTargets.delete(id);
    for (const [id, c] of db.pubClaims) if (targetIds.has(c.targetId)) db.pubClaims.delete(id);
    const releaseIds = new Set(
      [...db.pubReleases.values()].filter((r) => targetIds.has(r.targetId)).map((r) => r.id),
    );
    for (const id of releaseIds) db.pubReleases.delete(id);
    const subIds = new Set(
      [...db.pubSubmissions.values()].filter((s) => releaseIds.has(s.releaseId)).map((s) => s.id),
    );
    for (const id of subIds) db.pubSubmissions.delete(id);
    for (const [id, f] of db.pubFeedback) if (subIds.has(f.submissionId)) db.pubFeedback.delete(id);
    for (const [id, a] of db.pubActions) if (releaseIds.has(a.releaseId)) db.pubActions.delete(id);
    db.pubEvents = db.pubEvents.filter((e) => !projectIds.has(e.projectId));
    for (const [id, e] of db.experts) if (e.userId === userId) db.experts.delete(id);
    for (const [id, i] of db.installations) if (i.userId === userId) db.installations.delete(id);
    db.admins.delete(userId);
    db.users.delete(userId);
    db.profiles.rows.delete(userId);
    // ops data: remove what the user owns; the audit log keeps its entries with the actor removed
    this.ops.eraseUserData(userId);
    this.accounts.delete(userId);
    this.prefs.delete(userId);
    this.devices.delete(userId);
    this.outbox = this.outbox.filter((o) => o.userId !== userId);
    this.emails.delete(userId);
    this.erased.add(userId);
  }
}
