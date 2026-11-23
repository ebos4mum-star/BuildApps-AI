import {
  canTransition,
  evaluateReadiness,
  isValidVersion,
  looksLikeSecret,
  PLATFORMS,
  REASON_CATEGORIES,
  REVIEW_OUTCOMES,
  requirementDef,
  suggestCorrectiveActions,
  unresolvedActions,
  validateMetadata,
  type ActionStatus,
  type Claim,
  type Platform,
  type PublishingEvidence,
  type ReasonCategory,
  type Readiness,
  type ReleaseStatus,
  type ReviewOutcome,
} from "@buildapps/publishing";
import { z } from "zod";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import {
  DuplicateError,
  type ActionRow,
  type FeedbackRow,
  type PublishEventRow,
  type PublishTargetRow,
  type ReleaseRow,
  type SubmissionRow,
} from "./publishing-types";
import type { ServiceRequestRow } from "./batch2-types";

/** How each store is supported today. Honest labels: no store API is integrated. */
export const INTEGRATIONS = {
  apple_app_store: {
    mode: "manual",
    note: "Tracked manually. BuildApps does not connect to App Store Connect and has not submitted anything.",
  },
  google_play: {
    mode: "manual",
    note: "Tracked manually. BuildApps does not connect to Play Console and has not submitted anything.",
  },
  web: {
    mode: "manual",
    note: "Tracked manually. BuildApps does not deploy or check your live site.",
  },
} as const;

export interface ReleaseView {
  release: ReleaseRow;
  submissions: SubmissionRow[];
  feedback: FeedbackRow[];
  actions: ActionRow[];
  unresolvedActions: number;
  /** What the user may do next, with reasons when they may not. */
  gate: { canMarkReady: boolean; canSubmit: boolean; canResubmit: boolean; reasons: string[] };
}
export interface TargetView {
  target: PublishTargetRow;
  readiness: Readiness;
  claims: { key: string; kind: Claim["kind"]; note: string; at: string }[];
  releases: ReleaseView[];
  integration: (typeof INTEGRATIONS)[Platform];
}
export interface PublishingView {
  projectId: string;
  targets: TargetView[];
  events: PublishEventRow[];
  helpRequest: ServiceRequestRow | null;
  availablePlatforms: Platform[];
}

const invalid = (m: string) => new WorkspaceError("invalid", m);
const conflict = (m: string) => new WorkspaceError("conflict", m);
const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw invalid(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
};
const noSecrets = (s: string | null | undefined, what: string) => {
  if (s && looksLikeSecret(s))
    throw invalid(`${what} looks like it contains a password, token or key. Remove it.`);
};

// ---------- ownership ----------
async function ownedProject(d: Deps, userId: string, projectId: string) {
  const p = await d.stores.projects.get(userId, projectId);
  if (!p) throw new WorkspaceError("not_found", "Project not found");
  return p;
}
async function ownedTarget(d: Deps, userId: string, targetId: string) {
  const t = await d.stores.publishing.getTarget(targetId);
  if (!t) throw new WorkspaceError("not_found", "Publishing target not found");
  await ownedProject(d, userId, t.projectId);
  return t;
}
async function ownedRelease(d: Deps, userId: string, releaseId: string) {
  const r = await d.stores.publishing.getRelease(releaseId);
  if (!r) throw new WorkspaceError("not_found", "Release not found");
  return { release: r, target: await ownedTarget(d, userId, r.targetId) };
}
async function ownedAction(d: Deps, userId: string, actionId: string) {
  const a = await d.stores.publishing.getAction(actionId);
  if (!a) throw new WorkspaceError("not_found", "Action not found");
  return { action: a, ...(await ownedRelease(d, userId, a.releaseId)) };
}

async function evt(
  d: Deps,
  userId: string | null,
  role: PublishEventRow["actorRole"],
  projectId: string,
  targetId: string | null,
  releaseId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await d.stores.publishing.addEvent(
    { projectId, targetId, releaseId, actorId: userId, actorRole: role, action, detail },
    nowOf(d),
  );
}

// ---------- evidence + readiness ----------
/** Evidence comes ONLY from stored scans and verification runs - never from anything the user typed. */
export async function buildEvidence(d: Deps, projectId: string): Promise<PublishingEvidence> {
  const [scan, run, findings] = await Promise.all([
    d.stores.scans.latestScan(projectId),
    d.stores.scans.latestVerification(projectId),
    d.stores.scans.listFindings(projectId),
  ]);
  const present = scan ? findings.filter((f) => f.lastSeenScan === scan.id) : [];
  return {
    scan: scan
      ? {
          completedAt: scan.completedAt ?? scan.createdAt,
          filesRead: Number(scan.stats.filesRead ?? 0),
          openCritical: present.filter((f) => f.severity === "critical").length,
          openHigh: present.filter((f) => f.severity === "high").length,
          credentialFindings: present.filter((f) =>
            ["env-file-committed", "credential-file-committed", "hardcoded-secret"].includes(
              f.ruleId,
            ),
          ).length,
          expoIosIdMissing: present.some(
            (f) =>
              f.ruleId === "expo-store-ids-missing" && f.detail.includes("ios.bundleIdentifier"),
          ),
          expoAndroidIdMissing: present.some(
            (f) => f.ruleId === "expo-store-ids-missing" && f.detail.includes("android.package"),
          ),
        }
      : null,
    verification: run
      ? {
          createdAt: run.createdAt,
          commitSha: run.commitSha,
          checks: run.checks.map((c) => ({ id: c.id, status: c.status })),
        }
      : null,
  };
}

async function readinessFor(
  d: Deps,
  target: PublishTargetRow,
  releases?: ReleaseRow[],
): Promise<{
  readiness: Readiness;
  claims: Awaited<ReturnType<typeof d.stores.publishing.listClaims>>;
}> {
  const [claims, rels, evidence] = await Promise.all([
    d.stores.publishing.listClaims(target.id),
    releases ?? d.stores.publishing.listReleases(target.id),
    buildEvidence(d, target.projectId),
  ]);
  return {
    claims,
    readiness: evaluateReadiness({
      platform: target.platform,
      metadata: target.metadata,
      claims: Object.fromEntries(
        claims.map((c) => [c.key, { kind: c.kind, note: c.note, at: c.at }]),
      ),
      evidence,
      releaseVersions: rels.filter((r) => r.status !== "withdrawn").map((r) => r.version),
    }),
  };
}

async function releaseView(
  d: Deps,
  release: ReleaseRow,
  readiness: Readiness,
): Promise<ReleaseView> {
  const [submissions, feedback, actions] = await Promise.all([
    d.stores.publishing.listSubmissions(release.id),
    d.stores.publishing.listFeedback(release.id),
    d.stores.publishing.listActions(release.id),
  ]);
  const open = unresolvedActions(actions.map((a) => ({ status: a.status, note: a.note })));
  const reasons: string[] = [];
  if (!readiness.readyToSubmit)
    reasons.push(...readiness.blockers, ...readiness.missing.map((m) => `Missing: ${m}`));
  if (release.status === "rejected" && open > 0)
    reasons.push(`${open} corrective action(s) are unresolved`);
  return {
    release,
    submissions,
    feedback,
    actions,
    unresolvedActions: open,
    gate: {
      canMarkReady: release.status === "draft" && readiness.readyToSubmit,
      canSubmit: release.status === "ready" && readiness.readyToSubmit,
      canResubmit: release.status === "rejected" && readiness.readyToSubmit && open === 0,
      reasons,
    },
  };
}

/** Full publishing picture for a project. Used by the owner and (with a scoped handoff) by an expert. */
export async function buildPublishingView(
  d: Deps,
  ownerId: string,
  projectId: string,
): Promise<PublishingView> {
  const [targets, events, requests] = await Promise.all([
    d.stores.publishing.listTargets(projectId),
    d.stores.publishing.listEvents(projectId, 40),
    d.stores.rescue.listRequestsForRequester(ownerId),
  ]);
  const views: TargetView[] = [];
  for (const target of targets) {
    const releases = await d.stores.publishing.listReleases(target.id);
    const { readiness, claims } = await readinessFor(d, target, releases);
    views.push({
      target,
      readiness,
      integration: INTEGRATIONS[target.platform],
      claims: claims.map((c) => ({ key: c.key, kind: c.kind, note: c.note, at: c.at })),
      releases: await Promise.all(
        releases
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((r) => releaseView(d, r, readiness)),
      ),
    });
  }
  const have = new Set(targets.map((t) => t.platform));
  return {
    projectId,
    targets: views,
    events,
    helpRequest:
      requests
        .filter(
          (r) => r.projectId === projectId && r.kind === "publishing" && r.status !== "cancelled",
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    availablePlatforms: PLATFORMS.filter((p) => !have.has(p)),
  };
}
export async function getPublishing(d: Deps, userId: string, projectId: string) {
  await ownedProject(d, userId, projectId);
  return buildPublishingView(d, userId, projectId);
}

// ---------- targets, metadata, claims ----------
export async function addTarget(
  d: Deps,
  userId: string,
  projectId: string,
  platform: unknown,
): Promise<PublishTargetRow> {
  const p = parse(z.enum(PLATFORMS), platform);
  await ownedProject(d, userId, projectId);
  const before = (await d.stores.publishing.listTargets(projectId)).length;
  const t = await d.stores.publishing.createTarget(projectId, p, nowOf(d));
  if ((await d.stores.publishing.listTargets(projectId)).length > before)
    await evt(d, userId, "owner", projectId, t.id, null, "target_added", { platform: p });
  return t;
}

export async function saveMetadata(
  d: Deps,
  userId: string,
  targetId: string,
  input: unknown,
): Promise<PublishTargetRow> {
  const t = await ownedTarget(d, userId, targetId);
  const v = validateMetadata(t.platform, input);
  if (!v.ok) throw invalid(v.error);
  const updated = await d.stores.publishing.updateMetadata(t.id, v.value, nowOf(d));
  await evt(d, userId, "owner", t.projectId, t.id, null, "metadata_updated", {
    fields: Object.keys(v.value),
  });
  return updated;
}

const claimSchema = z.object({
  kind: z.enum(["self_reported", "not_applicable"]),
  note: z
    .string()
    .trim()
    .min(5, "Say briefly what you did or why it does not apply (at least 5 characters)")
    .max(500),
});

/**
 * Users may only CLAIM. Items that BuildApps verifies from evidence, or derives from metadata, cannot be
 * claimed at all; N/A is accepted only where the catalog allows it. `input = null` removes the claim.
 */
export async function setRequirementClaim(
  d: Deps,
  userId: string,
  targetId: string,
  key: string,
  input: unknown,
): Promise<{ removed: boolean }> {
  const t = await ownedTarget(d, userId, targetId);
  const def = requirementDef(key);
  if (!def || !def.platforms.includes(t.platform))
    throw invalid("That requirement does not apply to this publishing target");
  if (input === null) {
    await d.stores.publishing.deleteClaim(t.id, key);
    await evt(d, userId, "owner", t.projectId, t.id, null, "claim_removed", { requirement: key });
    return { removed: true };
  }
  const c = parse(claimSchema, input);
  noSecrets(c.note, "The note");
  if (c.kind === "self_reported" && !def.claimable)
    throw invalid(
      `"${def.title}" is checked from your repository or entered fields; it cannot be marked done by hand.`,
    );
  if (c.kind === "not_applicable" && !def.canBeNotApplicable)
    throw invalid(`"${def.title}" is required and cannot be marked not applicable.`);
  await d.stores.publishing.upsertClaim(t.id, key, {
    kind: c.kind,
    note: c.note,
    at: nowOf(d).toISOString(),
  });
  await evt(
    d,
    userId,
    "owner",
    t.projectId,
    t.id,
    null,
    c.kind === "self_reported" ? "claim_recorded" : "not_applicable_declared",
    { requirement: key, note: c.note },
  );
  return { removed: false };
}

// ---------- releases ----------
const releaseSchema = z.object({
  version: z.string().trim().max(40),
  buildNumber: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createRelease(
  d: Deps,
  userId: string,
  targetId: string,
  input: unknown,
): Promise<ReleaseRow> {
  const t = await ownedTarget(d, userId, targetId);
  const v = parse(releaseSchema, input);
  if (!isValidVersion(v.version)) throw invalid("Version must look like 1.0.0");
  noSecrets(v.notes, "Release notes");
  try {
    const r = await d.stores.publishing.createRelease(
      t.id,
      { version: v.version, buildNumber: v.buildNumber || null, notes: v.notes || null },
      nowOf(d),
    );
    await evt(d, userId, "owner", t.projectId, t.id, r.id, "release_created", {
      version: r.version,
    });
    return r;
  } catch (e) {
    if (e instanceof DuplicateError)
      throw conflict(`Version ${v.version} already exists for this target`);
    throw e;
  }
}

async function setReleaseStatus(
  d: Deps,
  release: ReleaseRow,
  to: ReleaseStatus,
): Promise<ReleaseRow> {
  if (!canTransition(release.status, to))
    throw conflict(
      `A ${release.status.replace("_", " ")} release cannot move to ${to.replace("_", " ")}`,
    );
  return d.stores.publishing.updateRelease(release.id, { status: to }, nowOf(d));
}

export async function markReleaseReady(
  d: Deps,
  userId: string,
  releaseId: string,
): Promise<ReleaseRow> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  if (release.status === "ready") return release; // idempotent
  const { readiness } = await readinessFor(d, target);
  if (!readiness.readyToSubmit)
    throw conflict(
      `Not ready: ${[...readiness.blockers, ...readiness.missing.map((m) => `missing ${m}`)].slice(0, 4).join("; ")}`,
    );
  const r = await setReleaseStatus(d, release, "ready");
  await evt(d, userId, "owner", target.projectId, target.id, r.id, "marked_ready", {
    requiredVerified: readiness.requiredVerified,
    requiredSelfReported: readiness.requiredSelfReported,
  });
  return r;
}
export async function unreadyRelease(
  d: Deps,
  userId: string,
  releaseId: string,
): Promise<ReleaseRow> {
  const { release } = await ownedRelease(d, userId, releaseId);
  return setReleaseStatus(d, release, "draft");
}

const refSchema = z.object({ storeReference: z.string().trim().max(200).optional() }).default({});

/**
 * Records that the OWNER submitted this release to the store themselves. BuildApps submits nothing and
 * cannot confirm it. Readiness is re-checked now, and repeating the call never creates a second attempt.
 */
export async function recordSubmission(
  d: Deps,
  userId: string,
  releaseId: string,
  input: unknown = {},
): Promise<{ release: ReleaseRow; submission: SubmissionRow; alreadyRecorded: boolean }> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  const { storeReference } = parse(refSchema, input ?? {});
  noSecrets(storeReference, "The store reference");
  const subs = await d.stores.publishing.listSubmissions(release.id);
  const active = subs.find((s) => s.status === "submitted" || s.status === "in_review");
  if ((release.status === "submitted" || release.status === "in_review") && active)
    return { release, submission: active, alreadyRecorded: true };
  if (release.status !== "ready")
    throw conflict(
      `Only a release that is marked ready can be submitted (this one is ${release.status.replace("_", " ")})`,
    );
  const { readiness } = await readinessFor(d, target);
  if (!readiness.readyToSubmit)
    throw conflict(
      `Readiness changed: ${[...readiness.blockers, ...readiness.missing.map((m) => `missing ${m}`)].slice(0, 3).join("; ")}`,
    );
  // submission first, then the release status (the database requires a recorded submission for a submitted release)
  const submission =
    active ?? (await createSubmissionSafe(d, release.id, 1, storeReference ?? null));
  const updated = await setReleaseStatus(d, release, "submitted");
  await evt(d, userId, "owner", target.projectId, target.id, release.id, "submission_recorded", {
    attempt: submission.attemptNumber,
    note: "Recorded by the owner; not verified with the store.",
  });
  return { release: updated, submission, alreadyRecorded: false };
}

async function createSubmissionSafe(
  d: Deps,
  releaseId: string,
  attempt: number,
  ref: string | null,
) {
  try {
    return await d.stores.publishing.createSubmission(releaseId, attempt, ref, nowOf(d));
  } catch (e) {
    if (e instanceof DuplicateError)
      throw conflict("A submission is already recorded for this release");
    throw e;
  }
}

export async function markInReview(
  d: Deps,
  userId: string,
  releaseId: string,
): Promise<ReleaseRow> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  if (release.status === "in_review") return release;
  const active = (await d.stores.publishing.listSubmissions(release.id)).find(
    (s) => s.status === "submitted",
  );
  if (release.status !== "submitted" || !active)
    throw conflict("Only a submitted release can be marked as in review");
  await d.stores.publishing.updateSubmission(active.id, { status: "in_review" });
  const r = await setReleaseStatus(d, release, "in_review");
  await evt(d, userId, "owner", target.projectId, target.id, r.id, "review_started", {
    note: "Reported by the owner.",
  });
  return r;
}

const outcomeSchema = z.object({
  outcome: z.enum(REVIEW_OUTCOMES),
  reasonCategory: z.enum(REASON_CATEGORIES).default("other"),
  guidelineRef: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1, "Paste or summarise the reviewer's message").max(4000),
});

/** Records the outcome the owner received from the store. It is the owner's report, never BuildApps' finding. */
export async function recordReviewOutcome(
  d: Deps,
  userId: string,
  releaseId: string,
  input: unknown,
): Promise<{ release: ReleaseRow; feedback: FeedbackRow; actions: ActionRow[] }> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  const v = parse(outcomeSchema, input);
  noSecrets(v.message, "The message");
  const active = (await d.stores.publishing.listSubmissions(release.id)).find(
    (s) => s.status === "submitted" || s.status === "in_review",
  );
  if (!active || (release.status !== "submitted" && release.status !== "in_review"))
    throw conflict(
      "Review feedback can only be recorded for a submitted release that is awaiting a decision",
    );
  const outcome: ReviewOutcome = v.outcome;
  const category: ReasonCategory = outcome === "approved" ? "other" : v.reasonCategory;
  const feedback = await d.stores.publishing.addFeedback(
    active.id,
    { outcome, reasonCategory: category, guidelineRef: v.guidelineRef || null, message: v.message },
    nowOf(d),
  );
  const actions: ActionRow[] = [];
  let updated = release;

  if (outcome === "rejected") {
    await d.stores.publishing.updateSubmission(active.id, {
      status: "rejected",
      decidedAt: nowOf(d).toISOString(),
    });
    updated = await setReleaseStatus(d, release, "rejected");
    for (const s of suggestCorrectiveActions(category))
      actions.push(
        await d.stores.publishing.addAction(
          release.id,
          {
            feedbackId: feedback.id,
            title: s.title,
            detail: s.detail,
            requirementKey: s.requirementKeys[0] ?? null,
            findingId: null,
          },
          nowOf(d),
        ),
      );
  } else if (outcome === "approved") {
    await d.stores.publishing.updateSubmission(active.id, {
      status: "approved",
      decidedAt: nowOf(d).toISOString(),
    });
    updated = await setReleaseStatus(d, release, "approved");
  } else {
    if (active.status === "submitted") {
      await d.stores.publishing.updateSubmission(active.id, { status: "in_review" });
      updated = await setReleaseStatus(d, release, "in_review");
    }
    actions.push(
      await d.stores.publishing.addAction(
        release.id,
        {
          feedbackId: feedback.id,
          title: "Respond to the reviewer's request for information",
          detail: v.message.slice(0, 500),
          requirementKey: null,
          findingId: null,
        },
        nowOf(d),
      ),
    );
  }
  await evt(d, userId, "owner", target.projectId, target.id, release.id, `review_${outcome}`, {
    attempt: active.attemptNumber,
    reason: category,
    guideline: v.guidelineRef ?? null,
    note: "Reported by the owner; not verified with the store.",
  });
  return { release: updated, feedback, actions };
}

const actionCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  detail: z.string().trim().max(1000).optional(),
  requirementKey: z.string().max(80).optional(),
});
export async function addCorrectiveAction(
  d: Deps,
  userId: string,
  releaseId: string,
  input: unknown,
): Promise<ActionRow> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  const v = parse(actionCreateSchema, input);
  noSecrets(v.detail, "The detail");
  if (v.requirementKey && !requirementDef(v.requirementKey)) throw invalid("Unknown requirement");
  if (["released", "withdrawn"].includes(release.status)) throw conflict("This release is closed");
  const a = await d.stores.publishing.addAction(
    release.id,
    {
      feedbackId: null,
      title: v.title,
      detail: v.detail ?? null,
      requirementKey: v.requirementKey ?? null,
      findingId: null,
    },
    nowOf(d),
  );
  await evt(d, userId, "owner", target.projectId, target.id, release.id, "action_added", {
    title: a.title,
  });
  return a;
}

const actionUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "wont_fix"]),
  note: z.string().trim().max(500).optional(),
});
export async function updateCorrectiveAction(
  d: Deps,
  userId: string,
  actionId: string,
  input: unknown,
): Promise<ActionRow> {
  const { action, target, release } = await ownedAction(d, userId, actionId);
  const v = parse(actionUpdateSchema, input);
  const status: ActionStatus = v.status;
  if (status === "wont_fix" && (v.note?.length ?? 0) < 5)
    throw invalid("Say why you are not fixing this (at least 5 characters)");
  noSecrets(v.note, "The note");
  const updated = await d.stores.publishing.updateAction(
    action.id,
    {
      status,
      note: v.note ?? action.note,
      doneAt: status === "done" ? nowOf(d).toISOString() : null,
    },
    nowOf(d),
  );
  await evt(d, userId, "owner", target.projectId, target.id, release.id, "action_updated", {
    title: action.title,
    status,
  });
  return updated;
}

/** After a rejection: every corrective action must be resolved and readiness re-checked, then a NEW attempt is recorded. */
export async function recordResubmission(
  d: Deps,
  userId: string,
  releaseId: string,
  input: unknown = {},
): Promise<{ release: ReleaseRow; submission: SubmissionRow; alreadyRecorded: boolean }> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  const { storeReference } = parse(refSchema, input ?? {});
  noSecrets(storeReference, "The store reference");
  const subs = await d.stores.publishing.listSubmissions(release.id);
  const active = subs.find((s) => s.status === "submitted" || s.status === "in_review");
  if (
    (release.status === "submitted" || release.status === "in_review") &&
    active &&
    active.attemptNumber > 1
  )
    return { release, submission: active, alreadyRecorded: true };
  if (release.status !== "rejected") throw conflict("Only a rejected release can be resubmitted");
  const actions = await d.stores.publishing.listActions(release.id);
  const open = unresolvedActions(actions.map((a) => ({ status: a.status, note: a.note })));
  if (open > 0) throw conflict(`Resolve the ${open} open corrective action(s) before resubmitting`);
  const { readiness } = await readinessFor(d, target);
  if (!readiness.readyToSubmit)
    throw conflict(
      `Not ready to resubmit: ${[...readiness.blockers, ...readiness.missing.map((m) => `missing ${m}`)].slice(0, 3).join("; ")}`,
    );
  const attempt = Math.max(0, ...subs.map((s) => s.attemptNumber)) + 1;
  const submission = await createSubmissionSafe(d, release.id, attempt, storeReference ?? null);
  const updated = await setReleaseStatus(d, release, "submitted");
  await evt(d, userId, "owner", target.projectId, target.id, release.id, "resubmission_recorded", {
    attempt,
    note: "Recorded by the owner; not verified with the store.",
  });
  return { release: updated, submission, alreadyRecorded: false };
}

export async function markReleased(
  d: Deps,
  userId: string,
  releaseId: string,
): Promise<ReleaseRow> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  if (release.status === "released") return release;
  const r = await setReleaseStatus(d, release, "released"); // only approved -> released
  await evt(d, userId, "owner", target.projectId, target.id, r.id, "released", {
    note: "Reported by the owner; BuildApps did not check the live store listing.",
  });
  return r;
}

export async function withdrawRelease(
  d: Deps,
  userId: string,
  releaseId: string,
): Promise<ReleaseRow> {
  const { release, target } = await ownedRelease(d, userId, releaseId);
  if (release.status === "withdrawn") return release;
  const active = (await d.stores.publishing.listSubmissions(release.id)).find(
    (s) => s.status === "submitted" || s.status === "in_review",
  );
  if (active)
    await d.stores.publishing.updateSubmission(active.id, {
      status: "withdrawn",
      decidedAt: nowOf(d).toISOString(),
    });
  const r = await setReleaseStatus(d, release, "withdrawn");
  await evt(d, userId, "owner", target.projectId, target.id, r.id, "withdrawn");
  return r;
}

// ---------- Publishing Assistance (reuses the service-request + expert infrastructure) ----------
const assistSchema = z.object({
  targetId: z.string().min(1).max(128).optional(),
  summary: z
    .string()
    .trim()
    .min(10, "Describe what you need help with (at least 10 characters)")
    .max(2000),
});
export async function requestPublishingAssistance(
  d: Deps,
  userId: string,
  projectId: string,
  input: unknown,
): Promise<{ request: ServiceRequestRow | null; alreadyOpen: boolean }> {
  const v = parse(assistSchema, input);
  await ownedProject(d, userId, projectId);
  noSecrets(v.summary, "The request");
  if (v.targetId) {
    const t = await d.stores.publishing.getTarget(v.targetId);
    if (!t || t.projectId !== projectId)
      throw new WorkspaceError("not_found", "Publishing target not found");
  }
  if (await d.stores.projects.hasOpenServiceRequest(userId, projectId, "publishing")) {
    const existing =
      (await d.stores.rescue.listRequestsForRequester(userId)).find(
        (r) =>
          r.projectId === projectId &&
          r.kind === "publishing" &&
          !["completed", "cancelled"].includes(r.status),
      ) ?? null;
    return { request: existing, alreadyOpen: true };
  }
  const id = await d.stores.projects.createServiceRequest(userId, projectId, v.summary, {
    kind: "publishing",
    publishTargetId: v.targetId ?? null,
  });
  await evt(d, userId, "owner", projectId, v.targetId ?? null, null, "assistance_requested", {
    requestId: id,
  });
  return { request: await d.stores.rescue.getRequest(id), alreadyOpen: false };
}
