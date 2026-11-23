import type { Severity } from "./types";

export interface ReadinessFinding {
  severity: Severity;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  resolutionSource: "user" | "rescan" | "verification" | null;
}

export interface Readiness {
  /** Can this project honestly be called ready to publish? */
  ready: boolean;
  /** Human-readable reasons it is not (empty when ready). */
  blockers: string[];
  openBySeverity: Record<Severity, number>;
}

/**
 * Readiness needs ALL of: every required milestone done AND verified, no open or merely-dismissed
 * critical/high findings, and the latest CI/static verification not failing.
 * A user dismissing a serious finding never makes a project "ready" - only a clean rescan does.
 */
export function computeReadiness(input: {
  findings: readonly ReadinessFinding[];
  requiredMilestones: { done: number; verified: number; total: number };
  hasScan: boolean;
  latestVerification: "pass" | "fail" | "none";
}): Readiness {
  const open: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const unresolvedSerious = { count: 0 };
  for (const f of input.findings) {
    if (f.status === "open" || f.status === "in_progress") open[f.severity]++;
    if (
      (f.severity === "critical" || f.severity === "high") &&
      (f.status === "open" || f.status === "in_progress" || f.status === "dismissed")
    )
      unresolvedSerious.count++;
  }
  const blockers: string[] = [];
  const m = input.requiredMilestones;
  if (!input.hasScan) blockers.push("The project has not been scanned yet");
  if (m.total === 0 || m.done < m.total)
    blockers.push(`${m.total - m.done} required milestone(s) are not done`);
  else if (m.verified < m.total)
    blockers.push(`${m.total - m.verified} required milestone(s) are self-reported, not verified`);
  if (unresolvedSerious.count > 0)
    blockers.push(`${unresolvedSerious.count} critical/high finding(s) are unresolved`);
  if (input.latestVerification === "fail")
    blockers.push("The latest verification run has failing checks");
  if (input.latestVerification === "none") blockers.push("No verification run has been recorded");
  return { ready: blockers.length === 0, blockers, openBySeverity: open };
}
