import { calculateProgress, type Project } from "@buildapps/core";
import { buildLearningPath } from "@buildapps/lessons";
import { computeReadiness, type Readiness } from "@buildapps/scanner";
import { z } from "zod";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import { recommendForFindings, type LessonRecommendation } from "./project-learning";
import { guidanceFor, type FindingGuidance } from "./finding-guidance";
import { runtimeAvailability, type RuntimeAvailability } from "@buildapps/sandbox";
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
  /** Plain-language help, a corrective task and the matching lesson for each open finding, by finding id. */
  guidance: Record<
    string,
    FindingGuidance & {
      lessonTitle: string;
      lessonStatus: "available" | "in_progress" | "locked" | "complete";
    }
  >;
  /** Whether isolated runtime verification may run (fails closed). */
  runtime: RuntimeAvailability;
  /** Lessons linked to the open findings of this project. */
  recommendedLessons: LessonRecommendation[];
}

function buildGuidance(
  findings: FindingRow[],
  passed: ReadonlySet<string>,
  placedOut: ReadonlySet<string>,
): WorkspaceView["guidance"] {
  const path = buildLearningPath(passed, placedOut);
  const status = new Map(path.units.flatMap((u) => u.lessons).map((l) => [l.id, l]));
  const out: WorkspaceView["guidance"] = {};
  for (const f of findings) {
    if (f.status === "resolved" || f.status === "dismissed") continue;
    const gd = guidanceFor(f.ruleId);
    const lesson = gd ? status.get(gd.lessonId) : undefined;
    if (gd && lesson) out[f.id] = { ...gd, lessonTitle: lesson.title, lessonStatus: lesson.status };
  }
  return out;
}

export async function getWorkspace(
  d: Deps,
  userId: string,
  projectId: string,
): Promise<WorkspaceView> {
  const project = await d.stores.projects.get(userId, projectId);
  if (!project) throw new WorkspaceError("not_found", "Project not found");
  const [link, latestScan, findings, latestVerification, requests, learner] = await Promise.all([
    d.stores.projects.getGithubLink(userId, projectId),
    d.stores.scans.latestScan(projectId),
    d.stores.scans.listFindings(projectId),
    d.stores.scans.latestVerification(projectId),
    d.stores.rescue.listRequestsForRequester(userId),
    d.stores.progress.load(userId, ""),
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
    guidance: buildGuidance(sorted, learner.passedExerciseIds, learner.placedOut),
    runtime: runtimeAvailability(
      d.sandbox?.backendName ?? null,
      d.sandbox?.attestation ?? null,
      nowOf(d),
    ),
    recommendedLessons: recommendForFindings(
      findings,
      learner.passedExerciseIds,
      4,
      learner.placedOut,
    ),
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
