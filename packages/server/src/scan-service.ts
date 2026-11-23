import { completeMilestone, type Project } from "@buildapps/core";
import { GitHubError } from "@buildapps/github";
import {
  evaluateCiChecks,
  runStaticChecks,
  scanSnapshot,
  type Area,
  type Finding,
  type RepoSnapshot,
  type ScanReport,
  type VerificationCheck,
} from "@buildapps/scanner";
import { computeAward, type XpAward } from "@buildapps/core";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type {
  FindingRow,
  IncomingFinding,
  InstallationRow,
  ScanRow,
  SyncStats,
  VerificationRunRow,
} from "./batch2-types";
import { syncAchievements } from "./stats";

export const MAX_SCANS_PER_HOUR = 6;

/** Which of the project's own milestones a scanner "area" feeds. Only existing milestone keys are used. */
const AREA_MAP: Record<Project["journey"], Record<Area, string | null>> = {
  rescue: {
    blocker: "fix-blockers",
    build: "restore-build",
    tests: "tests-pass",
    completeness: "fix-blockers",
    hygiene: null,
  },
  start: {
    blocker: "core-features",
    build: "prototype",
    tests: "tests-pass",
    completeness: "core-features",
    hygiene: null,
  },
  continue: {
    blocker: "finish-features",
    build: "finish-features",
    tests: "tests-pass",
    completeness: "finish-features",
    hygiene: null,
  },
};
export function milestoneForArea(project: Project, area: Area): string | null {
  const key = AREA_MAP[project.journey][area];
  return key && project.milestones.some((m) => m.id === key) ? key : null;
}

const toIncoming = (project: Project, f: Finding): IncomingFinding => ({
  ruleId: f.ruleId,
  fingerprint: f.fingerprint,
  kind: f.kind,
  category: f.category,
  severity: f.severity,
  title: f.title,
  detail: f.detail,
  remedy: f.remedy,
  evidence: f.evidence,
  milestoneKey: milestoneForArea(project, f.area),
});

async function connected(
  d: Deps,
  userId: string,
  projectId: string,
): Promise<{ project: Project; install: InstallationRow }> {
  if (!d.gateway)
    throw new WorkspaceError("unavailable", "GitHub integration is not configured on this server");
  const project = await d.stores.projects.get(userId, projectId);
  if (!project) throw new WorkspaceError("not_found", "Project not found");
  const link = await d.stores.projects.getGithubLink(userId, projectId);
  const install = link.installationRowId
    ? await d.stores.github.getInstallation(userId, link.installationRowId)
    : null;
  if (!install || !project.repo)
    throw new WorkspaceError("not_connected", "Connect a GitHub repository to this project first");
  return { project, install };
}

export interface ScanOutcome {
  scan: ScanRow;
  report: ScanReport;
  snapshot: RepoSnapshot;
  sync: SyncStats;
  project: Project;
  install: InstallationRow;
}

/** Fetch a bounded read-only snapshot, run static analysis, merge findings. Nothing is ever executed. */
export async function performScan(
  d: Deps,
  userId: string,
  projectId: string,
): Promise<ScanOutcome> {
  const now = nowOf(d);
  const { project, install } = await connected(d, userId, projectId);
  if (
    (await d.stores.scans.countScansSince(projectId, new Date(now.getTime() - 3_600_000))) >=
    MAX_SCANS_PER_HOUR
  )
    throw new WorkspaceError("rate_limited", "Scan limit reached for this hour. Try again later.");
  const scan = await d.stores.scans.createScan({ projectId, requestedBy: userId, now });
  let snapshot: RepoSnapshot;
  try {
    snapshot = await d.gateway!.getSnapshot(
      install.installationId,
      project.repo!.owner,
      project.repo!.name,
    );
  } catch (e) {
    const denied = e instanceof GitHubError && (e.status === 403 || e.status === 404);
    const msg = denied
      ? "GitHub denied access to this repository. Check which repositories the app can see."
      : "Could not read the repository from GitHub";
    await d.stores.scans.failScan(scan.id, msg, nowOf(d));
    throw new WorkspaceError(denied ? "not_connected" : "github_error", msg);
  }
  const report = scanSnapshot(snapshot);
  const sync = await d.stores.scans.syncFindings(
    projectId,
    scan.id,
    report.findings.map((f) => toIncoming(project, f)),
  );
  await d.stores.scans.completeScan(scan.id, {
    commitSha: snapshot.commitSha ?? null,
    ref: snapshot.ref ?? null,
    stats: {
      files: report.profile.stats.files,
      filesRead: report.profile.stats.contentFilesScanned,
      truncated: snapshot.truncated,
      sync,
    },
    assessment: {
      headline: report.summary.headline,
      byKind: report.summary.byKind,
      bySeverity: report.summary.bySeverity,
      frameworks: report.profile.frameworks,
      languages: report.profile.languages,
      analysisLevel: report.profile.analysisLevel,
      limits: report.limits,
      tasks: report.tasks.slice(0, 12).map((t) => ({
        priority: t.priority,
        title: t.title,
        action: t.action,
        kind: t.kind,
        severity: t.severity,
      })),
    },
    now: nowOf(d),
  });
  return {
    scan: (await d.stores.scans.latestScan(projectId))!,
    report,
    snapshot,
    sync,
    project,
    install,
  };
}

export interface VerifiedMilestone {
  milestoneKey: string;
  evidenceRef: string;
  reason: string;
}

/**
 * The ONLY rules that can mark a milestone verified. Every rule needs deterministic evidence from a
 * stored scan or verification run: a user's claim, or any AI-written explanation, is never enough.
 */
export function evaluateMilestoneEvidence(input: {
  project: Project;
  scan: ScanRow | null;
  findings: FindingRow[];
  run: VerificationRunRow | null;
}): VerifiedMilestone[] {
  const { project, scan, findings, run } = input;
  const out: VerifiedMilestone[] = [];
  const has = (key: string) => project.milestones.some((m) => m.id === key);
  if (scan?.status === "complete" && has("assess") && Number(scan.stats.filesRead ?? 0) > 0)
    out.push({
      milestoneKey: "assess",
      evidenceRef: `scan:${scan.id}`,
      reason: "A completed repository scan assessed the project.",
    });
  if (scan?.status === "complete" && has("fix-blockers")) {
    // Blocking = serious findings the LATEST scan still detects. Dismissals and user claims never clear
    // a finding that is still present; a finding the scan no longer sees is gone regardless of status.
    const unresolved = findings.filter(
      (f) => (f.severity === "critical" || f.severity === "high") && f.lastSeenScan === scan.id,
    );
    if (unresolved.length === 0)
      out.push({
        milestoneKey: "fix-blockers",
        evidenceRef: `scan:${scan.id}`,
        reason: "The latest scan shows no unresolved critical or high findings.",
      });
  }
  if (run) {
    const status = (id: string) => run.checks.find((c) => c.id === id)?.status;
    if (
      has("tests-pass") &&
      status("ci.green") === "pass" &&
      status("static.tests-present") === "pass"
    )
      out.push({
        milestoneKey: "tests-pass",
        evidenceRef: `verification:${run.id}`,
        reason: "Repository CI passed on the latest commit and tests exist.",
      });
    if (
      has("restore-build") &&
      status("ci.green") === "pass" &&
      status("static.build-script") === "pass"
    )
      out.push({
        milestoneKey: "restore-build",
        evidenceRef: `verification:${run.id}`,
        reason: "Repository CI passed on the latest commit and a build script exists.",
      });
  }
  return out;
}

/** Marks milestones verified (server-only path), saves the project and grants idempotent XP/achievements. */
export async function applyVerifiedMilestones(
  d: Deps,
  userId: string,
  projectId: string,
  candidates: VerifiedMilestone[],
): Promise<VerifiedMilestone[]> {
  const now = nowOf(d);
  let project = await d.stores.projects.get(userId, projectId);
  if (
    !project ||
    (project.state !== "active" &&
      project.state !== "needs_help" &&
      project.state !== "in_verification" &&
      project.state !== "completed")
  )
    return [];
  const applied: VerifiedMilestone[] = [];
  for (const c of candidates) {
    const m = project.milestones.find((x) => x.id === c.milestoneKey);
    if (!m || m.completion?.source === "verified") continue;
    project = completeMilestone(project, c.milestoneKey, "verified", now, c.evidenceRef);
    applied.push(c);
  }
  if (applied.length === 0) return [];
  await d.stores.projects.save(project);
  const state = await d.stores.progress.load(userId, "");
  const keys = new Set(state.awardKeys);
  const awards: XpAward[] = [];
  for (const c of applied) {
    const m = project.milestones.find((x) => x.id === c.milestoneKey)!;
    const r = computeAward(
      {
        source: "project_milestone",
        userId,
        projectId,
        milestoneId: m.id,
        completionSource: "verified",
        xpValue: Math.min(500, 50 * m.weight),
        occurredAt: now,
      },
      { existingAwardKeys: keys, exerciseXpEarnedToday: 0, timeZone: "UTC" },
    );
    if (r.status === "awarded") {
      awards.push(r.award);
      keys.add(r.award.awardKey);
    }
  }
  await d.stores.progress.grant({
    userId,
    awards: awards.map((a) => ({
      awardKey: a.awardKey,
      source: a.source,
      xp: a.xp,
      occurredAt: a.occurredAt.toISOString(),
    })),
    achievements: [],
  });
  await syncAchievements(d.stores.progress, userId, now);
  return applied;
}

export async function runScan(d: Deps, userId: string, projectId: string) {
  const o = await performScan(d, userId, projectId);
  const findings = await d.stores.scans.listFindings(projectId);
  const verified = await applyVerifiedMilestones(
    d,
    userId,
    projectId,
    evaluateMilestoneEvidence({ project: o.project, scan: o.scan, findings, run: null }),
  );
  return {
    scan: o.scan,
    sync: o.sync,
    verified,
    summary: o.report.summary,
    limits: o.report.limits,
  };
}

/** Fresh scan + repository CI evidence + safe static checks, stored as one verification run. */
export async function runVerification(d: Deps, userId: string, projectId: string) {
  const o = await performScan(d, userId, projectId);
  const runs = o.snapshot.commitSha
    ? await d.gateway!.getCheckRuns(
        o.install.installationId,
        o.project.repo!.owner,
        o.project.repo!.name,
        o.snapshot.commitSha,
      )
    : null;
  const checks: VerificationCheck[] = [
    ...runStaticChecks(o.snapshot, o.report.profile, o.report.findings),
    evaluateCiChecks(runs, o.snapshot.commitSha),
  ];
  const run = await d.stores.scans.createVerificationRun({
    projectId,
    requestedBy: userId,
    commitSha: o.snapshot.commitSha ?? null,
    status: "complete",
    checks,
    now: nowOf(d),
  });
  const findings = await d.stores.scans.listFindings(projectId);
  const verified = await applyVerifiedMilestones(
    d,
    userId,
    projectId,
    evaluateMilestoneEvidence({ project: o.project, scan: o.scan, findings, run }),
  );
  return { run, scan: o.scan, sync: o.sync, verified };
}
