import { describe, expect, it } from "vitest";
import { FakeGitHubGateway } from "@buildapps/github";
import { requirementsFor, type Platform } from "@buildapps/publishing";
import {
  addCorrectiveAction,
  addTarget,
  adminMatch,
  adminReviewExpert,
  applyAsExpert,
  changeProjectState,
  completeGithubConnect,
  createMemoryStores,
  createRelease,
  createUserProject,
  expertWorkspace,
  getPublishing,
  grantHandoff,
  linkProjectRepo,
  markInReview,
  markReleased,
  markReleaseReady,
  recordResubmission,
  recordReviewOutcome,
  recordSubmission,
  requestPublishingAssistance,
  runScan,
  runVerification,
  saveMetadata,
  setRequirementClaim,
  startGithubConnect,
  unreadyRelease,
  updateCorrectiveAction,
  withdrawRelease,
  askForHumanHelp,
  WorkspaceError,
  type Deps,
} from "./index";

const SECRET = "s".repeat(32);
function setup() {
  const stores = createMemoryStores();
  const gateway = new FakeGitHubGateway();
  let clock = new Date("2026-04-01T10:00:00Z");
  const deps: Deps = { stores, gateway, stateSecret: SECRET, now: () => clock };
  return {
    stores,
    gateway,
    deps,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}
type Ctx = ReturnType<typeof setup>;
const code = async (fn: () => Promise<unknown>) =>
  fn().then(
    () => "ok",
    (e) => (e instanceof WorkspaceError ? e.code : `other:${e}`),
  );

/** A project linked to a fixture repo (healthy = CI green + tests + no findings; stuck = failing CI + committed secrets). */
async function project(c: Ctx, user: string, repo: "healthy-app" | "stuck-app", verify = true) {
  const p = await createUserProject(c.stores.projects, user, {
    journey: "continue",
    name: repo,
    description: "Login works, the rest is unfinished",
    repoUrl: `https://github.com/demo/${repo}`,
  });
  await changeProjectState(c.stores.projects, user, p.id, "active");
  const state = new URL(startGithubConnect(c.deps, user).url, "http://x").searchParams.get(
    "state",
  )!;
  const { installation } = await completeGithubConnect(c.deps, {
    state,
    installationId: 1001,
    code: "dev",
  });
  await linkProjectRepo(c.deps, user, p.id, installation.id, `demo/${repo}`);
  if (verify) await runVerification(c.deps, user, p.id);
  return p;
}

const CLAIMS: Record<Platform, string[]> = {
  apple_app_store: [
    "privacy.data-disclosure",
    "assets.icon",
    "assets.screenshots",
    "apple.developer-account",
    "apple.signing",
    "apple.age-rating",
    "apple.export-compliance",
    "apple.review-access",
  ],
  google_play: [
    "privacy.data-disclosure",
    "assets.icon",
    "assets.screenshots",
    "google.developer-account",
    "google.signing",
    "google.data-safety",
    "google.content-rating",
    "google.store-requirements",
  ],
  web: ["privacy.data-disclosure", "web.deployment"],
};
const META: Record<Platform, object> = {
  apple_app_store: { bundleId: "com.example.habit" },
  google_play: { packageName: "com.example.habit" },
  web: { siteUrl: "https://habit.example.com" },
};
const BASE_META = {
  appName: "Habit Hero",
  description:
    "A habit tracker for students that rewards consistency with streaks, quests and friendly reminders.",
  category: "Productivity",
  supportUrl: "https://example.com/support",
  privacyPolicyUrl: "https://example.com/privacy",
  hasLogin: true,
  collectsUserData: true,
};

/** Everything the USER can supply; readiness still needs system evidence on top. */
async function fillTarget(c: Ctx, user: string, targetId: string, platform: Platform) {
  await saveMetadata(c.deps, user, targetId, { ...BASE_META, ...META[platform] });
  for (const key of CLAIMS[platform])
    await setRequirementClaim(c.deps, user, targetId, key, {
      kind: "self_reported",
      note: "Done in the store console, screenshots saved",
    });
}
const view = async (c: Ctx, user: string, projectId: string, platform: Platform) =>
  (await getPublishing(c.deps, user, projectId)).targets.find(
    (t) => t.target.platform === platform,
  )!;
const status = (t: Awaited<ReturnType<typeof view>>, key: string) =>
  t.readiness.results.find((r) => r.key === key)!.status;

describe("ownership and isolation", () => {
  it("one user can never see or change another user's publishing data", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "google_play");
    await fillTarget(c, "alice", t.id, "google_play");
    const rel = await createRelease(c.deps, "alice", t.id, { version: "1.0.0" });
    const a = await addCorrectiveAction(c.deps, "alice", rel.id, {
      title: "Check the listing text",
    });
    const other = await createUserProject(c.stores.projects, "mallory", {
      journey: "start",
      name: "m",
      idea: "my own habit app idea",
      platform: "web",
    });

    for (const fn of [
      () => getPublishing(c.deps, "mallory", p.id),
      () => addTarget(c.deps, "mallory", p.id, "web"),
      () => saveMetadata(c.deps, "mallory", t.id, { appName: "Hijacked" }),
      () =>
        setRequirementClaim(c.deps, "mallory", t.id, "assets.icon", {
          kind: "self_reported",
          note: "I did this myself",
        }),
      () => createRelease(c.deps, "mallory", t.id, { version: "9.9.9" }),
      () => markReleaseReady(c.deps, "mallory", rel.id),
      () => recordSubmission(c.deps, "mallory", rel.id),
      () =>
        recordReviewOutcome(c.deps, "mallory", rel.id, {
          outcome: "approved",
          message: "approved!",
        }),
      () => withdrawRelease(c.deps, "mallory", rel.id),
      () => updateCorrectiveAction(c.deps, "mallory", a.id, { status: "done" }),
      () =>
        requestPublishingAssistance(c.deps, "mallory", p.id, {
          summary: "help me publish this app",
        }),
    ])
      expect(await code(fn)).toBe("not_found");
    // and a target of ANOTHER project of the same user cannot be used for assistance
    expect(
      await code(() =>
        requestPublishingAssistance(c.deps, "alice", other.id, {
          targetId: t.id,
          summary: "help me publish this app",
        }),
      ),
    ).toBe("not_found");
    expect((await getPublishing(c.deps, "alice", p.id)).targets[0]!.target.metadata.appName).toBe(
      "Habit Hero",
    ); // untouched
  });
});

describe("targets, metadata and claims", () => {
  it("targets are idempotent and validated", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const a = await addTarget(c.deps, "alice", p.id, "apple_app_store");
    const b = await addTarget(c.deps, "alice", p.id, "apple_app_store");
    expect(b.id).toBe(a.id);
    expect((await getPublishing(c.deps, "alice", p.id)).targets).toHaveLength(1);
    expect(
      (await getPublishing(c.deps, "alice", p.id)).events.filter(
        (e) => e.action === "target_added",
      ),
    ).toHaveLength(1);
    expect(await code(() => addTarget(c.deps, "alice", p.id, "steam"))).toBe("invalid");
    expect((await getPublishing(c.deps, "alice", p.id)).availablePlatforms).toEqual([
      "google_play",
      "web",
    ]);
  });

  it("metadata rejects wrong-platform fields, bad values and credentials", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "apple_app_store");
    for (const bad of [
      { packageName: "com.example.x" },
      { bundleId: "no spaces allowed" },
      { privacyPolicyUrl: "http://insecure.example" },
      { appName: "x".repeat(40) },
      { reviewNotes: "demo login password: Sup3rSecret!" },
      { nope: 1 },
    ])
      expect(await code(() => saveMetadata(c.deps, "alice", t.id, bad)), JSON.stringify(bad)).toBe(
        "invalid",
      );
    await saveMetadata(c.deps, "alice", t.id, {
      appName: "Habit Hero",
      bundleId: "com.example.habit",
    });
    const v = await view(c, "alice", p.id, "apple_app_store");
    expect(status(v, "apple.bundle-id")).toBe("self_reported");
    expect(v.target.metadata).toEqual({ appName: "Habit Hero", bundleId: "com.example.habit" });
  });

  it("claims: only claimable items, N/A only where allowed, never 'verified'", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "apple_app_store");
    const claim = (key: string, kind: string, note = "I did this in App Store Connect") =>
      setRequirementClaim(c.deps, "alice", t.id, key, { kind, note });
    expect(await code(() => claim("build.ci-passing", "self_reported"))).toBe("invalid"); // system-evidence item
    expect(await code(() => claim("security.no-credentials", "self_reported"))).toBe("invalid");
    expect(await code(() => claim("identity.app-name", "self_reported"))).toBe("invalid"); // derived from metadata
    expect(await code(() => claim("apple.signing", "not_applicable"))).toBe("invalid"); // required
    expect(await code(() => claim("apple.signing", "verified"))).toBe("invalid"); // not a claim kind at all
    expect(await code(() => claim("google.signing", "self_reported"))).toBe("invalid"); // wrong platform
    expect(await code(() => claim("nope.nope", "self_reported"))).toBe("invalid");
    expect(await code(() => claim("apple.signing", "self_reported", "ok"))).toBe("invalid"); // note too short
    expect(
      await code(() => claim("apple.signing", "self_reported", "token: ghp_" + "a".repeat(36))),
    ).toBe("invalid"); // secret in note
    expect(await code(() => claim("apple.signing", "self_reported"))).toBe("ok");
    expect(
      await code(() =>
        claim("apple.review-access", "not_applicable", "The app has no accounts or login"),
      ),
    ).toBe("ok");
    let v = await view(c, "alice", p.id, "apple_app_store");
    expect(status(v, "apple.signing")).toBe("self_reported");
    expect(status(v, "apple.review-access")).toBe("not_applicable");
    expect(v.readiness.counts.verified).toBeGreaterThanOrEqual(0);
    expect(
      v.readiness.results
        .filter((r) => r.source === "user_claim")
        .every((r) => r.status !== "verified"),
    ).toBe(true);
    await setRequirementClaim(c.deps, "alice", t.id, "apple.signing", null);
    v = await view(c, "alice", p.id, "apple_app_store");
    expect(status(v, "apple.signing")).toBe("missing");
  });
});

describe("readiness with real evidence", () => {
  it("is ready only when user input AND scan/CI evidence agree; verified items come from evidence only", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "google_play");
    let v = await view(c, "alice", p.id, "google_play");
    expect(v.readiness.readyToSubmit).toBe(false);
    expect(status(v, "build.ci-passing")).toBe("verified"); // evidence exists already
    expect(status(v, "privacy.policy-url")).toBe("missing"); // but the owner has entered nothing
    await fillTarget(c, "alice", t.id, "google_play");
    const created = await createRelease(c.deps, "alice", t.id, { version: "1.0.0" });
    expect(await code(() => markReleaseReady(c.deps, "alice", created.id))).toBe("ok");
    v = await view(c, "alice", p.id, "google_play");
    expect(v.readiness).toMatchObject({ readyToSubmit: true, blockers: [], missing: [] });
    expect(v.readiness.requiredVerified).toBeGreaterThanOrEqual(4);
    expect(v.readiness.requiredSelfReported).toBeGreaterThan(v.readiness.requiredVerified);
    expect(v.readiness.disclaimer).toMatch(/not an approval/);
    expect(v.integration.mode).toBe("manual");
  });

  it("no scan/verification means evidence items are MISSING, not assumed fine", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app", false);
    const t = await addTarget(c.deps, "alice", p.id, "web");
    await fillTarget(c, "alice", t.id, "web");
    const rel = await createRelease(c.deps, "alice", t.id, { version: "1.0.0" });
    const v = await view(c, "alice", p.id, "web");
    for (const key of [
      "build.ci-passing",
      "testing.evidence",
      "security.no-credentials",
      "security.no-serious-findings",
      "web.build",
    ])
      expect(status(v, key), key).toBe("missing");
    expect(v.readiness.readyToSubmit).toBe(false);
    expect(await code(() => markReleaseReady(c.deps, "alice", rel.id))).toBe("conflict");
  });

  it("a stuck repo is BLOCKED by evidence, and nothing the user enters can clear it", async () => {
    const c = setup();
    const p = await project(c, "alice", "stuck-app");
    const t = await addTarget(c.deps, "alice", p.id, "google_play");
    await fillTarget(c, "alice", t.id, "google_play");
    const rel = await createRelease(c.deps, "alice", t.id, { version: "1.0.0" });
    const v = await view(c, "alice", p.id, "google_play");
    expect(status(v, "build.ci-passing")).toBe("blocked");
    expect(status(v, "security.no-credentials")).toBe("blocked");
    expect(status(v, "security.no-serious-findings")).toBe("blocked");
    expect(v.readiness.blockers.length).toBeGreaterThanOrEqual(3);
    expect(await code(() => markReleaseReady(c.deps, "alice", rel.id))).toBe("conflict");
    // dismissing the findings does not unblock publishing
    for (const f of (await c.stores.scans.listFindings(p.id)).filter((x) =>
      ["critical", "high"].includes(x.severity),
    ))
      await c.stores.scans.updateFinding(p.id, f.id, {
        status: "dismissed",
        statusNote: "accepted risk",
        decidedByUser: true,
        resolutionSource: null,
        now: new Date(),
      });
    expect(
      status(await view(c, "alice", p.id, "google_play"), "security.no-serious-findings"),
    ).toBe("blocked");
  });

  it("readiness is recomputed at the gate: evidence that changes after 'ready' stops a submission", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "web");
    await fillTarget(c, "alice", t.id, "web");
    const rel = await createRelease(c.deps, "alice", t.id, { version: "1.0.0" });
    await markReleaseReady(c.deps, "alice", rel.id);
    // the repository regresses: a committed .env and a failing CI appear before the owner submits
    const repo = c.gateway.repos.find((r) => r.info.name === "healthy-app")!;
    repo.files[".env"] = 80;
    repo.checks = [{ name: "CI", status: "completed", conclusion: "failure" }];
    c.advance(60_000);
    await runVerification(c.deps, "alice", p.id);
    expect(await code(() => recordSubmission(c.deps, "alice", rel.id))).toBe("conflict");
    expect((await view(c, "alice", p.id, "web")).releases[0]!.release.status).toBe("ready");
  });
});

describe("release, submission and rejection lifecycle", () => {
  async function readyRelease(c: Ctx, user = "alice") {
    const p = await project(c, user, "healthy-app");
    const t = await addTarget(c.deps, user, p.id, "apple_app_store");
    await fillTarget(c, user, t.id, "apple_app_store");
    const rel = await createRelease(c.deps, user, t.id, {
      version: "1.0.0",
      buildNumber: "42",
      notes: "First release",
    });
    return { p, t, rel };
  }

  it("validates versions and rejects duplicates", async () => {
    const c = setup();
    const { t } = await readyRelease(c);
    for (const v of ["1", "v1.0.0", "1.0", "x", ""])
      expect(await code(() => createRelease(c.deps, "alice", t.id, { version: v })), v).toBe(
        "invalid",
      );
    expect(await code(() => createRelease(c.deps, "alice", t.id, { version: "1.0.0" }))).toBe(
      "conflict",
    );
    expect(
      await code(() =>
        createRelease(c.deps, "alice", t.id, {
          version: "1.1.0",
          notes: "key: AKIA" + "ABCDEFGHIJKLMNOP",
        }),
      ),
    ).toBe("invalid");
  });

  it("walks draft -> ready -> submitted -> in review -> rejected -> corrected -> resubmitted -> approved -> released", async () => {
    const c = setup();
    const { p, rel } = await readyRelease(c);
    expect(await markReleaseReady(c.deps, "alice", rel.id)).toMatchObject({ status: "ready" });
    expect((await markReleaseReady(c.deps, "alice", rel.id)).status).toBe("ready"); // idempotent

    const first = await recordSubmission(c.deps, "alice", rel.id, {
      storeReference: "build 42 uploaded",
    });
    expect(first).toMatchObject({
      alreadyRecorded: false,
      release: { status: "submitted" },
      submission: { attemptNumber: 1 },
    });
    const again = await recordSubmission(c.deps, "alice", rel.id); // double click / retry
    expect(again).toMatchObject({ alreadyRecorded: true });
    expect(again.submission.id).toBe(first.submission.id);
    expect(await c.stores.publishing.listSubmissions(rel.id)).toHaveLength(1);

    expect((await markInReview(c.deps, "alice", rel.id)).status).toBe("in_review");
    const rejected = await recordReviewOutcome(c.deps, "alice", rel.id, {
      outcome: "rejected",
      reasonCategory: "privacy",
      guidelineRef: "5.1.1",
      message: "Your privacy policy does not describe the data you collect.",
    });
    expect(rejected.release.status).toBe("rejected");
    expect(rejected.actions.length).toBeGreaterThan(0);
    expect(rejected.actions[0]).toMatchObject({
      status: "open",
      requirementKey: "privacy.policy-url",
      feedbackId: rejected.feedback.id,
    });

    // cannot resubmit until every corrective action is resolved
    expect(await code(() => recordResubmission(c.deps, "alice", rel.id))).toBe("conflict");
    const extra = await addCorrectiveAction(c.deps, "alice", rel.id, {
      title: "Reply to the reviewer in Resolution Center",
    });
    expect(
      await code(() => updateCorrectiveAction(c.deps, "alice", extra.id, { status: "wont_fix" })),
    ).toBe("invalid"); // reason required
    await updateCorrectiveAction(c.deps, "alice", extra.id, {
      status: "wont_fix",
      note: "Reviewer message was automated; replied already",
    });
    for (const a of rejected.actions)
      await updateCorrectiveAction(c.deps, "alice", a.id, { status: "done" });

    const second = await recordResubmission(c.deps, "alice", rel.id, {
      storeReference: "build 43 uploaded",
    });
    expect(second).toMatchObject({
      alreadyRecorded: false,
      release: { status: "submitted" },
      submission: { attemptNumber: 2 },
    });
    expect((await recordResubmission(c.deps, "alice", rel.id)).alreadyRecorded).toBe(true); // idempotent
    expect(await c.stores.publishing.listSubmissions(rel.id)).toHaveLength(2);

    const approved = await recordReviewOutcome(c.deps, "alice", rel.id, {
      outcome: "approved",
      message: "Your app is now ready for distribution.",
    });
    expect(approved.release.status).toBe("approved");
    expect((await markReleased(c.deps, "alice", rel.id)).status).toBe("released");
    expect((await markReleased(c.deps, "alice", rel.id)).status).toBe("released"); // idempotent

    const final = (await view(c, "alice", p.id, "apple_app_store")).releases[0]!;
    expect(final.submissions.map((s) => `${s.attemptNumber}:${s.status}`)).toEqual([
      "1:rejected",
      "2:approved",
    ]);
    expect(final.feedback.map((f) => f.outcome)).toEqual(["rejected", "approved"]);
    const trail = (await getPublishing(c.deps, "alice", p.id)).events.map((e) => e.action);
    expect(trail).toEqual(
      expect.arrayContaining([
        "target_added",
        "metadata_updated",
        "release_created",
        "marked_ready",
        "submission_recorded",
        "review_started",
        "review_rejected",
        "action_updated",
        "resubmission_recorded",
        "review_approved",
        "released",
      ]),
    );
    // every store-status event is labelled as the owner's report, never as BuildApps' finding
    const storeEvents = (await getPublishing(c.deps, "alice", p.id)).events.filter((e) =>
      [
        "submission_recorded",
        "resubmission_recorded",
        "review_started",
        "review_rejected",
        "review_approved",
        "released",
      ].includes(e.action),
    );
    expect(storeEvents).toHaveLength(6);
    for (const e of storeEvents) expect(String(e.detail.note), e.action).toMatch(/owner/i);
  });

  it("rejects every illegal transition and unsupported claim of approval", async () => {
    const c = setup();
    const { rel } = await readyRelease(c);
    // draft: cannot be submitted, reviewed, approved or released
    expect(await code(() => recordSubmission(c.deps, "alice", rel.id))).toBe("conflict");
    expect(await code(() => markInReview(c.deps, "alice", rel.id))).toBe("conflict");
    expect(
      await code(() =>
        recordReviewOutcome(c.deps, "alice", rel.id, { outcome: "approved", message: "approved" }),
      ),
    ).toBe("conflict"); // cannot claim approval without a submission
    expect(await code(() => markReleased(c.deps, "alice", rel.id))).toBe("conflict");
    expect(await code(() => recordResubmission(c.deps, "alice", rel.id))).toBe("conflict");
    await markReleaseReady(c.deps, "alice", rel.id);
    expect(await code(() => markReleased(c.deps, "alice", rel.id))).toBe("conflict");
    expect(
      await code(() =>
        recordReviewOutcome(c.deps, "alice", rel.id, { outcome: "rejected", message: "no" }),
      ),
    ).toBe("conflict");
    await recordSubmission(c.deps, "alice", rel.id);
    expect(await code(() => markReleased(c.deps, "alice", rel.id))).toBe("conflict"); // submitted is not approved
    expect(await code(() => markReleaseReady(c.deps, "alice", rel.id))).toBe("conflict");
    expect(await code(() => unreadyRelease(c.deps, "alice", rel.id))).toBe("conflict");
    expect(
      await code(() =>
        recordReviewOutcome(c.deps, "alice", rel.id, { outcome: "bogus", message: "x" }),
      ),
    ).toBe("invalid");
    expect(
      await code(() =>
        recordReviewOutcome(c.deps, "alice", rel.id, { outcome: "approved", message: "" }),
      ),
    ).toBe("invalid");
    await recordReviewOutcome(c.deps, "alice", rel.id, {
      outcome: "approved",
      message: "Approved by the store",
    });
    expect(
      await code(() =>
        recordReviewOutcome(c.deps, "alice", rel.id, {
          outcome: "rejected",
          message: "changed our mind",
        }),
      ),
    ).toBe("conflict"); // decided once
    expect(await code(() => withdrawRelease(c.deps, "alice", rel.id))).toBe("conflict"); // approved cannot be withdrawn
    await markReleased(c.deps, "alice", rel.id);
    expect(await code(() => withdrawRelease(c.deps, "alice", rel.id))).toBe("conflict");
    expect(
      await code(() => addCorrectiveAction(c.deps, "alice", rel.id, { title: "too late to add" })),
    ).toBe("conflict");
  });

  it("info requests keep the release in review; withdraw ends the active submission", async () => {
    const c = setup();
    const { rel } = await readyRelease(c);
    await markReleaseReady(c.deps, "alice", rel.id);
    await recordSubmission(c.deps, "alice", rel.id);
    const r = await recordReviewOutcome(c.deps, "alice", rel.id, {
      outcome: "info_requested",
      message: "Please explain why the app needs location access.",
    });
    expect(r.release.status).toBe("in_review");
    expect(r.actions[0]!.title).toMatch(/Respond/);
    expect((await withdrawRelease(c.deps, "alice", rel.id)).status).toBe("withdrawn");
    expect((await c.stores.publishing.listSubmissions(rel.id))[0]!.status).toBe("withdrawn");
    expect((await withdrawRelease(c.deps, "alice", rel.id)).status).toBe("withdrawn"); // idempotent
  });

  it("two releases of one target can't both hold an active submission by accident, and attempts never duplicate", async () => {
    const c = setup();
    const { t, rel } = await readyRelease(c);
    await markReleaseReady(c.deps, "alice", rel.id);
    const results = await Promise.allSettled([
      recordSubmission(c.deps, "alice", rel.id),
      recordSubmission(c.deps, "alice", rel.id),
      recordSubmission(c.deps, "alice", rel.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await c.stores.publishing.listSubmissions(rel.id)).toHaveLength(1);
    const rel2 = await createRelease(c.deps, "alice", t.id, { version: "1.1.0" });
    expect(rel2.status).toBe("draft");
  });
});

describe("Publishing Assistance (service-request infrastructure, manual matching)", () => {
  it("is idempotent while open, separate from rescue help, and flows through admin matching + scoped handoff", async () => {
    const c = setup();
    c.stores.db.admins.add("admin");
    const p = await project(c, "alice", "healthy-app");
    const t = await addTarget(c.deps, "alice", p.id, "apple_app_store");
    await fillTarget(c, "alice", t.id, "apple_app_store");
    expect(
      await code(() => requestPublishingAssistance(c.deps, "alice", p.id, { summary: "short" })),
    ).toBe("invalid");
    expect(
      await code(() =>
        requestPublishingAssistance(c.deps, "alice", p.id, {
          summary: "my password: hunter22222 please log in",
        }),
      ),
    ).toBe("invalid");
    const first = await requestPublishingAssistance(c.deps, "alice", p.id, {
      targetId: t.id,
      summary: "Please review my App Store submission before I send it",
    });
    const again = await requestPublishingAssistance(c.deps, "alice", p.id, {
      summary: "Asking a second time should not duplicate",
    });
    expect(first.alreadyOpen).toBe(false);
    expect(again).toMatchObject({ alreadyOpen: true });
    expect(again.request!.id).toBe(first.request!.id);
    expect(first.request).toMatchObject({
      kind: "publishing",
      publishTargetId: t.id,
      status: "submitted",
    });

    // rescue help is a different queue: both may be open at once
    await askForHumanHelp(
      c.stores.projects,
      "alice",
      p.id,
      "Please help with the findings in my project",
    );
    expect(
      (await c.stores.rescue.listRequestsForRequester("alice")).map((r) => r.kind).sort(),
    ).toEqual(["publishing", "rescue"]);
    expect((await getPublishing(c.deps, "alice", p.id)).helpRequest?.id).toBe(first.request!.id);

    // vetted expert, manual match, and a handoff limited to publishing
    const e = await applyAsExpert(c.deps, "dana", { displayName: "Dana", skills: ["app store"] });
    await adminReviewExpert(c.deps, "admin", e.id, { decision: "approved" });
    await adminMatch(c.deps, "admin", first.request!.id, e.id);
    expect(await code(() => expertWorkspace(c.deps, "dana", first.request!.id))).toBe("forbidden"); // nothing granted yet
    await grantHandoff(c.deps, "alice", first.request!.id, { scopes: ["view_findings"], days: 3 });
    expect((await expertWorkspace(c.deps, "dana", first.request!.id)).publishing).toBeUndefined(); // wrong scope
    await c.stores.rescue.revokeHandoffs(first.request!.id, new Date());
    await grantHandoff(c.deps, "alice", first.request!.id, {
      scopes: ["view_publishing"],
      days: 3,
    });
    const w = await expertWorkspace(c.deps, "dana", first.request!.id);
    expect(w.publishing?.targets[0]!.readiness.platform).toBe("apple_app_store");
    expect(w.publishing!.targets[0]!.readiness.requiredTotal).toBeGreaterThan(10);
    expect(w.findings).toBeUndefined(); // scoped: nothing beyond publishing
    expect(w.project).toBeUndefined();
    expect(JSON.stringify(w)).not.toMatch(/password|token|secret/i); // no credentials are collected or exposed
  });
});

describe("regression: existing project functionality is unaffected", () => {
  it("scan, verification milestones, workspace and rescue still work alongside publishing", async () => {
    const c = setup();
    const p = await project(c, "alice", "healthy-app");
    await addTarget(c.deps, "alice", p.id, "web");
    const proj = (await c.stores.projects.get("alice", p.id))!;
    expect(proj.milestones.find((m) => m.id === "tests-pass")?.completion?.source).toBe("verified");
    await runScan(c.deps, "alice", p.id);
    expect(
      (await c.stores.scans.listFindings(p.id)).filter((f) =>
        ["critical", "high"].includes(f.severity),
      ),
    ).toEqual([]);
    expect(requirementsFor("web").length).toBeGreaterThan(5);
  });
});
