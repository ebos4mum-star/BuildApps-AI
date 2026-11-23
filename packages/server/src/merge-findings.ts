import type { FindingRow, IncomingFinding, SyncStats } from "./batch2-types";

/**
 * Pure mirror of the SQL function `sync_findings` (used by the in-memory store; the real database
 * runs the SQL, which has its own tests). Rules:
 *  - new fingerprint -> inserted as open
 *  - seen again: details refreshed; `resolved` (user claim or earlier scan) is REOPENED; dismissed /
 *    in-progress user decisions are left alone
 *  - not seen: open/in-progress work becomes resolved-by-rescan, and a user's "resolved" claim is
 *    upgraded to scan-confirmed. Only scan-confirmed resolutions count towards verification.
 */
export function mergeFindings(
  projectId: string,
  existing: FindingRow[],
  incoming: IncomingFinding[],
  scanId: string,
  now: Date,
  newId: () => string,
): { rows: FindingRow[]; stats: SyncStats } {
  const iso = now.toISOString();
  const byFp = new Map(existing.map((r) => [r.fingerprint, { ...r }]));
  const seen = new Set<string>();
  const stats: SyncStats = { new: 0, reopened: 0, resolved: 0 };
  for (const f of incoming) {
    if (seen.has(f.fingerprint)) continue;
    seen.add(f.fingerprint);
    const cur = byFp.get(f.fingerprint);
    if (!cur) {
      byFp.set(f.fingerprint, {
        id: newId(),
        projectId,
        ...f,
        status: "open",
        statusNote: null,
        decidedByUser: false,
        resolutionSource: null,
        firstSeenScan: scanId,
        lastSeenScan: scanId,
        createdAt: iso,
        updatedAt: iso,
      });
      stats.new++;
    } else {
      const reopen = cur.status === "resolved";
      Object.assign(cur, {
        kind: f.kind,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        remedy: f.remedy || cur.remedy,
        evidence: f.evidence,
        milestoneKey: f.milestoneKey,
        lastSeenScan: scanId,
        updatedAt: iso,
      });
      if (reopen) {
        cur.status = "open";
        cur.resolutionSource = null;
        stats.reopened++;
      }
    }
  }
  for (const cur of byFp.values()) {
    if (cur.lastSeenScan === scanId) continue;
    if (
      cur.status === "open" ||
      cur.status === "in_progress" ||
      (cur.status === "resolved" && cur.resolutionSource === "user")
    ) {
      cur.status = "resolved";
      cur.resolutionSource = "rescan";
      cur.updatedAt = iso;
      stats.resolved++;
    }
  }
  return { rows: [...byFp.values()], stats };
}
