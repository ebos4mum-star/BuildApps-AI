import { runtimeAvailability } from "@buildapps/sandbox";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";

export type IntegrationStatus = "configured" | "not_configured";
export interface HealthReport {
  generatedAt: string;
  integrations: {
    id: string;
    label: string;
    status: IntegrationStatus;
    /** Everything here is configuration only; a live round trip has never been verified from this repository. */
    verified: false;
    note: string;
  }[];
  notifications: Awaited<ReturnType<Deps["stores"]["account"]["outboxStats"]>>;
  support: { open: number; oldestOpenHours: number | null };
  privacy: { pendingDeletions: number; readyForReview: number; erasureEnabled: boolean };
  runtime: ReturnType<typeof runtimeAvailability>;
  attention: string[];
}

/** One screen of operational truth for administrators. Reads only; never modifies anything. */
export async function getOperationalHealth(d: Deps, adminId: string): Promise<HealthReport> {
  if (!(await d.stores.rescue.isAdmin(adminId)))
    throw new WorkspaceError("forbidden", "Administrators only");
  const now = nowOf(d);
  const [outbox, support, deletions] = await Promise.all([
    d.stores.account.outboxStats(now),
    d.stores.ops.listSupport("open"),
    d.stores.ops.listDeletions("pending"),
  ]);
  const oldest = support.map((s) => Date.parse(s.createdAt)).sort((a, b) => a - b)[0];
  const oldestOpenHours =
    oldest === undefined ? null : Math.floor((now.getTime() - oldest) / 3_600_000);
  const readyForReview = deletions.filter((x) => Date.parse(x.notBefore) <= now.getTime()).length;
  const runtime = runtimeAvailability(
    d.sandbox?.backendName ?? null,
    d.sandbox?.attestation ?? null,
    now,
  );
  const flag = (ok: boolean): IntegrationStatus => (ok ? "configured" : "not_configured");
  const attention: string[] = [];
  if (outbox.failed > 0) attention.push(`${outbox.failed} notification(s) failed permanently`);
  if ((outbox.oldestPendingMinutes ?? 0) > 120)
    attention.push("Notifications have been pending for over 2 hours");
  if ((oldestOpenHours ?? 0) > 48)
    attention.push("A support request has been open for over 48 hours");
  if (readyForReview > 0)
    attention.push(`${readyForReview} deletion request(s) are past the cooling-off period`);
  return {
    generatedAt: now.toISOString(),
    integrations: [
      {
        id: "github",
        label: "GitHub App",
        status: flag(!!d.gateway),
        verified: false,
        note: d.gateway
          ? "Credentials present; run the connect flow with a test repository to verify."
          : "Not configured: GitHub features report unavailable.",
      },
      {
        id: "push",
        label: "Push notifications",
        status: flag(!!d.notifications?.push),
        verified: false,
        note: d.notifications?.push
          ? `Adapter: ${d.notifications.push.name}`
          : "Not configured: push messages are skipped.",
      },
      {
        id: "email",
        label: "Email notifications",
        status: flag(!!d.notifications?.email),
        verified: false,
        note: d.notifications?.email
          ? `Adapter: ${d.notifications.email.name}`
          : "Not configured: email messages are skipped.",
      },
      {
        id: "sandbox",
        label: "Verification Lab execution",
        status: flag(runtime.available),
        verified: false,
        note: runtime.available ? "Isolation proven by probes." : runtime.reason,
      },
    ],
    notifications: outbox,
    support: { open: support.length, oldestOpenHours },
    privacy: {
      pendingDeletions: deletions.length,
      readyForReview,
      erasureEnabled: !!d.allowErasure,
    },
    runtime,
    attention,
  };
}
