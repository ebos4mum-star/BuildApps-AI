import { calculateProgress, type Project } from "@buildapps/core";
import { computeReadiness, type Readiness } from "@buildapps/scanner";
import { z } from "zod";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type { FindingRow, ScanRow, ServiceRequestRow, VerificationRunRow } from "./batch2-types";

const SEV = ["critical", "high", "medium", "low", "info"];

export interface WorkspaceView {
  project: Project;
  progress: ReturnType<typeof calculateProgress>;
  github: {
    connected: boolean;
    accountLogin: string | null;
    repo: string | null;
    installationRowId: string | null;
  };
  latestScan: ScanRow | null;
  findings: FindingRow[];
  latestVerification: VerificationRunRow | null;
  readiness: Readiness;
  helpRequest: ServiceRequestRow | null;
}

export async function getWorkspace(
  d: Deps,
  userId: string,
  projectId: string,
): Promise<WorkspaceView> {
  const project = await d.stores.projects.get(userId, projectId);
  if (!project) throw new WorkspaceError("not_found", "Project not found");
  const [link, latestScan, findings, latestVerification, requests] = await Promise.all([
    d.stores.projects.getGithubLink(userId, projectId),
    d.stores.scans.latestScan(projectId),
    d.stores.scans.listFindings(projectId),
    d.stores.scans.latestVerification(projectId),
    d.stores.rescue.listRequestsForRequester(userId),
  ]);
  const install = link.installationRowId
    ? await d.stores.github.getInstallation(userId, link.installationRowId)
    : null;
  const progress = calculateProgress(project.milestones);
  const required = project.milestones.filter((m) => m.required);
  const verdict = latestVerification
    ? latestVerification.checks.some((c) => c.status === "fail")
      ? "fail"
      : "pass"
    : "none";
  const sorted = [...findings].sort(
    (a, b) =>
      SEV.indexOf(a.severity) - SEV.indexOf(b.severity) ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
  return {
    project,
    progress,
    github: {
      connected: !!install && !!project.repo,
      accountLogin: install?.accountLogin ?? null,
      repo: project.repo ? `${project.repo.owner}/${project.repo.name}` : null,
      installationRowId: install?.id ?? null,
    },
    latestScan,
    findings: sorted,
    latestVerification,
    readiness: computeReadiness({
      findings: findings.map((f) => ({
        severity: f.severity,
        status: f.status,
        resolutionSource: f.resolutionSource,
        present: latestScan ? f.lastSeenScan === latestScan.id : true,
      })),
      requiredMilestones: {
        total: required.length,
        done: required.filter((m) => m.status === "done").length,
        verified: required.filter((m) => m.completion?.source === "verified").length,
      },
      hasScan: !!latestScan,
      latestVerification: verdict,
    }),
    helpRequest:
      requests
        .filter((r) => r.projectId === projectId && r.kind === "rescue" && r.status !== "cancelled")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
  };
}

const statusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Users track their own decisions here. Dismissals need a recorded reason and survive rescans; a
 * "resolved" claim is recorded as the user's claim and is re-checked by the next scan.
 */
export async function setFindingStatus(
  d: Deps,
  userId: string,
  projectId: string,
  findingId: string,
  input: unknown,
): Promise<FindingRow> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) throw new WorkspaceError("invalid", "Invalid status");
  const { status, note } = parsed.data;
  if (!(await d.stores.projects.get(userId, projectId)))
    throw new WorkspaceError("not_found", "Project not found");
  const f = await d.stores.scans.getFinding(projectId, findingId);
  if (!f) throw new WorkspaceError("not_found", "Finding not found");
  if (status === "dismissed" && (note?.length ?? 0) < 5)
    throw new WorkspaceError(
      "invalid",
      "Say why you are dismissing this finding (at least 5 characters)",
    );
  return d.stores.scans.updateFinding(projectId, findingId, {
    status,
    statusNote: note ? note : status === "open" ? null : f.statusNote,
    decidedByUser: status !== "open",
    resolutionSource: status === "resolved" ? "user" : null,
    now: nowOf(d),
  });
}
