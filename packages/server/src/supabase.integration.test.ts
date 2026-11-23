import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { curriculum } from "@buildapps/lessons";
import { FakeGitHubGateway } from "@buildapps/github";
import { RELEASE_STATUSES, RELEASE_TRANSITIONS } from "@buildapps/publishing";
import {
  adminListExperts,
  addTarget,
  createRelease,
  markReleased,
  markReleaseReady,
  recordResubmission,
  recordReviewOutcome,
  recordSubmission,
  requestPublishingAssistance,
  saveMetadata,
  setRequirementClaim,
  updateCorrectiveAction,
  adminMatch,
  adminReviewExpert,
  advanceProjectRecovery,
  applyAsExpert,
  askForHumanHelp,
  changeProjectState,
  completeGithubConnect,
  createSupabaseStores,
  createUserProject,
  disconnectGithub,
  expertWorkspace,
  getDashboard,
  getPublishing,
  getWorkspace,
  grantHandoff,
  linkProjectRepo,
  reportMilestone,
  revokeHandoff,
  runScan,
  runVerification,
  setFindingStatus,
  startGithubConnect,
  submitAttempt,
  verifyAccessToken,
  type Deps,
  type Stores,
} from "./index";

/**
 * Runs against a REAL local Supabase (`supabase start`), never against cloud projects.
 * Requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY; skipped otherwise.
 */
const {
  SUPABASE_URL: SB_URL,
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
} = process.env;
const enabled = Boolean(SB_URL && ANON && SERVICE);

// In CI the job sets REQUIRE_SUPABASE_INTEGRATION=1 so a missing env can never turn into a silent skip.
if (process.env.REQUIRE_SUPABASE_INTEGRATION === "1" && !enabled) {
  throw new Error("Supabase integration tests are required but SUPABASE_* env vars are missing");
}

describe.skipIf(!enabled)("real Supabase integration", () => {
  let admin: SupabaseClient;
  let stores: Stores;
  const users: { id: string; client: SupabaseClient; token: string }[] = [];

  async function makeUser(): Promise<{ id: string; client: SupabaseClient; token: string }> {
    const email = `it-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    const anon = createClient(SB_URL!, ANON!, { auth: { persistSession: false } });
    const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    const token = s.session!.access_token;
    const client = createClient(SB_URL!, ANON!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const u = { id: data.user.id, client, token };
    users.push(u);
    return u;
  }

  beforeAll(() => {
    admin = createClient(SB_URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    stores = createSupabaseStores(admin);
  });
  afterAll(async () => {
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  });

  const ex = curriculum.lessons[0]!.exercises[0]!; // anatomy-1-match
  const answer = {
    type: "match" as const,
    placements: (ex as { solution: Record<string, string> }).solution,
  };

  it("creates profile + progress rows on signup and verifies real tokens", async () => {
    const u = await makeUser();
    const { data: p } = await admin.from("profiles").select("id").eq("id", u.id);
    const { data: pr } = await admin.from("user_progress").select("total_xp").eq("user_id", u.id);
    expect(p).toHaveLength(1);
    expect(pr).toEqual([{ total_xp: 0 }]);
    expect(await verifyAccessToken(SB_URL!, ANON!, u.token)).toBe(u.id);
    expect(await verifyAccessToken(SB_URL!, ANON!, "not-a-token")).toBeNull();
  });

  it("RLS: users read only their own data and cannot write progression", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submitAttempt(stores.progress, { userId: a.id, exerciseId: ex.id, answer });

    const own = await a.client.from("user_progress").select("total_xp");
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data![0]!.total_xp).toBeGreaterThan(0);

    const others = await b.client.from("xp_awards").select("*");
    expect(others.data).toEqual([]); // bob cannot see alice's awards
    expect((await a.client.from("xp_awards").select("*")).data!.length).toBeGreaterThan(0);

    expect(
      (await a.client.from("user_progress").update({ total_xp: 99999 }).eq("user_id", a.id)).error,
    ).not.toBeNull();
    expect(
      (
        await a.client.from("xp_awards").insert({
          user_id: a.id,
          award_key: "x",
          source: "exercise",
          xp: 5,
          occurred_at: new Date().toISOString(),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await a.client.from("exercise_completions").insert({ user_id: a.id, exercise_id: "forged" }))
        .error,
    ).not.toBeNull();
    const rpc = await a.client.rpc("apply_attempt", {
      p_user_id: a.id,
      p_exercise_id: "x",
      p_passed: true,
      p_expected_version: 0,
      p_awards: [],
      p_achievements: [],
      p_streak: {},
    });
    expect(rpc.error).not.toBeNull();
  });

  it("XP is idempotent through the real RPC and the version check rejects stale writers", async () => {
    const u = await makeUser();
    const first = await submitAttempt(stores.progress, { userId: u.id, exerciseId: ex.id, answer });
    const again = await submitAttempt(stores.progress, { userId: u.id, exerciseId: ex.id, answer });
    expect(first.xpAwarded).toBeGreaterThan(0);
    expect(again.xpAwarded).toBe(0);
    expect(again.totalXp).toBe(first.totalXp);
    const dash = await getDashboard(stores.progress, u.id);
    expect(dash.totalXp).toBe(first.totalXp);
    expect(dash.streak.displayed).toBe(1);

    const state = await stores.progress.load(u.id, ex.id);
    const stale = await stores.progress.apply({
      userId: u.id,
      exerciseId: ex.id,
      passed: true,
      expectedVersion: state.version - 1,
      awards: [],
      achievements: [],
      streak: state.streak,
    });
    expect(stale.status).toBe("conflict");
  });

  it("concurrent identical submissions award exactly once", async () => {
    const u = await makeUser();
    const res = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        submitAttempt(stores.progress, { userId: u.id, exerciseId: ex.id, answer }),
      ),
    );
    const { data } = await admin
      .from("xp_awards")
      .select("award_key")
      .eq("user_id", u.id)
      .eq("award_key", `exercise:${ex.id}`);
    expect(data).toHaveLength(1);
    for (const r of res)
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "busy" });
  });

  it("projects: create/list/save through service role, RLS-visible to owner only", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const p = await createUserProject(stores.projects, a.id, {
      journey: "rescue",
      name: "Stuck",
      repoUrl: "https://github.com/octo/stuck",
      problem: "Build breaks after AI edits",
    });
    await changeProjectState(stores.projects, a.id, p.id, "active");
    await advanceProjectRecovery(stores.projects, a.id, p.id);
    await reportMilestone(stores.projects, a.id, p.id, "assess");
    await askForHumanHelp(stores.projects, a.id, p.id, "Need an expert to fix the build");

    const got = await stores.projects.get(a.id, p.id);
    expect(got?.recovery).toEqual({ stage: "triage", humanHelpRequested: true });
    expect(got?.milestones.find((m) => m.id === "assess")?.completion?.source).toBe(
      "user_reported",
    );
    expect(got?.milestones.map((m) => m.id)).toEqual(p.milestones.map((m) => m.id)); // order preserved
    expect(await stores.projects.get(b.id, p.id)).toBeNull();

    expect((await a.client.from("projects").select("id")).data).toHaveLength(1);
    expect((await a.client.from("project_milestones").select("id")).data!.length).toBe(
      p.milestones.length,
    );
    expect((await b.client.from("projects").select("id")).data).toEqual([]);
    expect((await a.client.from("service_requests").select("id")).data).toHaveLength(1);

    // owner may rename but never change state/owner or forge verified milestones
    expect(
      (await a.client.from("projects").update({ name: "Renamed" }).eq("id", p.id)).error,
    ).toBeNull();
    expect(
      (await a.client.from("projects").update({ state: "completed" }).eq("id", p.id)).error,
    ).not.toBeNull();
    expect(
      (
        await a.client
          .from("project_milestones")
          .update({ status: "done", completion_source: "verified", evidence_ref: "x" })
          .eq("project_id", p.id)
      ).error,
    ).not.toBeNull();
  });

  // ---------- Batch 2 on the real stack ----------
  const gateway = new FakeGitHubGateway();
  const mkDeps = (): Deps => ({ stores, gateway, stateSecret: "s".repeat(32) });

  async function connectedRescue(userId: string, repo: "stuck-app" | "healthy-app") {
    const deps = mkDeps();
    const p = await createUserProject(stores.projects, userId, {
      journey: "rescue",
      name: repo,
      repoUrl: `https://github.com/demo/${repo}`,
      problem: "Broken after AI edits, need help",
    });
    await changeProjectState(stores.projects, userId, p.id, "active");
    const state = new URL(startGithubConnect(deps, userId).url, "http://x").searchParams.get(
      "state",
    )!;
    const { installation } = await completeGithubConnect(deps, {
      state,
      installationId: 1001,
      code: "dev",
    });
    await linkProjectRepo(deps, userId, p.id, installation.id, `demo/${repo}`);
    return { deps, p, installation };
  }

  it("GitHub link + scan + findings persist; owner reads via RLS, others cannot; rescans are idempotent", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { deps, p, installation } = await connectedRescue(a.id, "stuck-app");
    expect((await stores.projects.getGithubLink(a.id, p.id)).installationRowId).toBe(
      installation.id,
    );

    const first = await runScan(deps, a.id, p.id);
    expect(first.sync.new).toBeGreaterThan(5);
    const second = await runScan(deps, a.id, p.id);
    expect(second.sync).toEqual({ new: 0, reopened: 0, resolved: 0 });

    const mine = await a.client.from("project_findings").select("fingerprint,kind,status,remedy");
    expect(mine.error).toBeNull();
    expect(mine.data!.length).toBe(first.sync.new);
    expect(mine.data!.every((f) => f.remedy.length > 10)).toBe(true);
    expect((await b.client.from("project_findings").select("id")).data).toEqual([]);
    expect((await a.client.from("scans").select("id")).data!.length).toBe(2);
    expect(
      (
        await a.client
          .from("project_findings")
          .update({ status: "resolved" })
          .eq("project_id", p.id)
      ).error,
    ).not.toBeNull();
    expect(JSON.stringify(mine.data)).not.toContain("Zq81LmN4pR7sT0uVwX2yAb3C"); // secrets never stored

    // verified assess milestone + idempotent XP through the real award_xp RPC
    const proj = await stores.projects.get(a.id, p.id);
    expect(proj!.milestones.find((m) => m.id === "assess")!.completion!.source).toBe("verified");
    const state = await stores.progress.load(a.id, "");
    expect(state.verifiedMilestones).toBe(1);
    expect(state.earnedAchievements.has("first-verified-milestone")).toBe(true);
    const xp = state.totalXp;
    await runScan(deps, a.id, p.id);
    expect((await stores.progress.load(a.id, "")).totalXp).toBe(xp);

    // user decisions survive a rescan, via the real sync_findings function
    const f = (await stores.scans.listFindings(p.id)).find((x) => x.severity === "critical")!;
    await setFindingStatus(deps, a.id, p.id, f.id, {
      status: "dismissed",
      note: "accepted for now",
    });
    await runScan(deps, a.id, p.id);
    expect(await stores.scans.getFinding(p.id, f.id)).toMatchObject({
      status: "dismissed",
      statusNote: "accepted for now",
      decidedByUser: true,
    });
  }, 30_000);

  it("verification run stores evidence and verifies milestones only from CI + static checks", async () => {
    const u = await makeUser();
    const { deps, p } = await connectedRescue(u.id, "healthy-app");
    const out = await runVerification(deps, u.id, p.id);
    expect(out.verified.map((v) => v.milestoneKey).sort()).toEqual([
      "assess",
      "fix-blockers",
      "restore-build",
      "tests-pass",
    ]);
    const { data } = await u.client.from("verification_runs").select("checks,commit_sha");
    expect(data).toHaveLength(1);
    expect(
      (data![0]!.checks as { id: string; status: string }[]).find((c) => c.id === "ci.green")!
        .status,
    ).toBe("pass");
    const w = await getWorkspace(deps, u.id, p.id);
    expect(w.readiness.ready).toBe(true);
    const { error } = await u.client
      .from("verification_runs")
      .insert({ project_id: p.id, requested_by: u.id, status: "complete" });
    expect(error).not.toBeNull(); // clients cannot forge evidence
    await disconnectGithub(deps, u.id, w.github.installationRowId!);
    expect((await stores.projects.getGithubLink(u.id, p.id)).installationRowId).toBeNull();
  }, 30_000);

  it("expert access: RLS follows the owner's scoped, time-limited, revocable handoff", async () => {
    const owner = await makeUser();
    const expertUser = await makeUser();
    const stranger = await makeUser();
    const adminUser = await makeUser();
    await admin.from("admins").insert({ user_id: adminUser.id });
    const { deps, p } = await connectedRescue(owner.id, "stuck-app");
    await runScan(deps, owner.id, p.id);
    await askForHumanHelp(stores.projects, owner.id, p.id, "Please help me fix this broken build");
    const req = (await stores.rescue.listRequestsForRequester(owner.id))[0]!;

    // expert application is pending until an administrator approves it
    const expert = await applyAsExpert(deps, expertUser.id, {
      displayName: "Dana",
      skills: ["next"],
    });
    expect(await adminListExperts(deps, adminUser.id, "pending")).toHaveLength(1);
    await expect(adminMatch(deps, adminUser.id, req.id, expert.id)).rejects.toMatchObject({
      code: "conflict",
    });
    await adminReviewExpert(deps, adminUser.id, expert.id, {
      decision: "approved",
      note: "portfolio checked",
    });
    await adminMatch(deps, adminUser.id, req.id, expert.id);

    expect((await expertUser.client.from("project_findings").select("id")).data).toEqual([]); // no handoff yet
    expect((await expertUser.client.from("projects").select("id")).data).toEqual([]);
    await grantHandoff(deps, owner.id, req.id, { scopes: ["view_findings"], days: 7 });
    expect(
      (await expertUser.client.from("project_findings").select("id")).data!.length,
    ).toBeGreaterThan(0);
    // append-only job activity trail: visible to owner + assigned expert only, never writable by clients
    const trail = await stores.rescue.listEvents(req.id);
    expect(trail.map((e) => e.action)).toEqual(["request_created", "matched", "handoff_granted"]);
    expect((await owner.client.from("request_events").select("action")).data).toHaveLength(3);
    expect((await expertUser.client.from("request_events").select("action")).data).toHaveLength(3);
    expect((await stranger.client.from("request_events").select("action")).data).toEqual([]);
    const forged = await owner.client
      .from("request_events")
      .insert({ service_request_id: req.id, actor_role: "owner", action: "forged" });
    expect(forged.error).not.toBeNull();
    const tamper = await admin
      .from("request_events")
      .update({ action: "tampered" })
      .eq("service_request_id", req.id);
    expect(tamper.error).not.toBeNull(); // immutable even for the service role

    expect((await expertUser.client.from("scans").select("id")).data).toEqual([]); // scope not granted
    expect((await expertUser.client.from("projects").select("id")).data).toEqual([]); // view_project not granted
    expect((await stranger.client.from("project_findings").select("id")).data).toEqual([]);
    expect(
      (
        await expertUser.client
          .from("project_findings")
          .update({ status: "resolved" })
          .eq("project_id", p.id)
      ).error,
    ).not.toBeNull();
    const view = await expertWorkspace(deps, expertUser.id, req.id);
    expect(view.findings!.length).toBeGreaterThan(0);

    // revoke => RLS closes immediately
    await revokeHandoff(deps, owner.id, req.id);
    expect((await expertUser.client.from("project_findings").select("id")).data).toEqual([]);
    await grantHandoff(deps, owner.id, req.id, {
      scopes: ["view_project", "view_findings"],
      days: 1,
    });
    expect((await expertUser.client.from("projects").select("name")).data).toEqual([
      { name: "stuck-app" },
    ]);

    // expiry is enforced by the database itself
    await admin
      .from("project_handoffs")
      .update({
        granted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("service_request_id", req.id)
      .eq("status", "active");
    expect((await expertUser.client.from("project_findings").select("id")).data).toEqual([]);
    expect((await expertUser.client.from("projects").select("id")).data).toEqual([]);

    // suspension cuts access even for a fresh handoff
    await revokeHandoff(deps, owner.id, req.id);
    await grantHandoff(deps, owner.id, req.id, { scopes: ["view_findings"], days: 3 });
    await adminReviewExpert(deps, adminUser.id, expert.id, { decision: "suspended" });
    expect((await expertUser.client.from("project_findings").select("id")).data).toEqual([]);

    // clients can never edit expert status or admins
    expect(
      (
        await expertUser.client
          .from("expert_profiles")
          .update({ status: "approved" })
          .eq("id", expert.id)
      ).error,
    ).not.toBeNull();
    expect((await expertUser.client.from("admins").select("*")).error).not.toBeNull();
  }, 40_000);

  // ---------- Stage 6: Publishing Center on the real stack ----------
  async function publishingProject(
    userId: string,
    repo: "healthy-app" | "stuck-app" = "healthy-app",
  ) {
    const { deps, p } = await connectedRescue(userId, repo);
    await runVerification(deps, userId, p.id);
    return { deps, p };
  }
  const FILL_META = {
    appName: "Habit Hero",
    description:
      "A habit tracker for students that rewards consistency with streaks, quests and friendly reminders.",
    category: "Productivity",
    supportUrl: "https://example.com/support",
    privacyPolicyUrl: "https://example.com/privacy",
    collectsUserData: true,
    hasLogin: true,
    packageName: "com.example.habit",
  };
  const GOOGLE_CLAIMS = [
    "privacy.data-disclosure",
    "assets.icon",
    "assets.screenshots",
    "google.developer-account",
    "google.signing",
    "google.data-safety",
    "google.content-rating",
    "google.store-requirements",
  ];

  it("publishing: full lifecycle through the real database, with RLS and an immutable audit trail", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { deps, p } = await publishingProject(owner.id);
    const target = await addTarget(deps, owner.id, p.id, "google_play");
    expect((await addTarget(deps, owner.id, p.id, "google_play")).id).toBe(target.id); // idempotent upsert
    await saveMetadata(deps, owner.id, target.id, FILL_META);
    for (const k of GOOGLE_CLAIMS)
      await setRequirementClaim(deps, owner.id, target.id, k, {
        kind: "self_reported",
        note: "Completed in Play Console",
      });
    const rel = await createRelease(deps, owner.id, target.id, {
      version: "1.0.0",
      buildNumber: "42",
    });
    await expect(
      createRelease(deps, owner.id, target.id, { version: "1.0.0" }),
    ).rejects.toMatchObject({ code: "conflict" });

    await markReleaseReady(deps, owner.id, rel.id);
    const first = await recordSubmission(deps, owner.id, rel.id, { storeReference: "build 42" });
    const again = await recordSubmission(deps, owner.id, rel.id);
    expect([first.alreadyRecorded, again.alreadyRecorded]).toEqual([false, true]);
    expect(await stores.publishing.listSubmissions(rel.id)).toHaveLength(1);

    const rejected = await recordReviewOutcome(deps, owner.id, rel.id, {
      outcome: "rejected",
      reasonCategory: "privacy",
      message: "Privacy policy mismatch",
    });
    expect(rejected.release.status).toBe("rejected");
    await expect(recordResubmission(deps, owner.id, rel.id)).rejects.toMatchObject({
      code: "conflict",
    }); // actions still open
    for (const a of rejected.actions)
      await updateCorrectiveAction(deps, owner.id, a.id, { status: "done" });
    expect((await recordResubmission(deps, owner.id, rel.id)).submission.attemptNumber).toBe(2);
    await recordReviewOutcome(deps, owner.id, rel.id, { outcome: "approved", message: "Approved" });
    expect((await markReleased(deps, owner.id, rel.id)).status).toBe("released");

    const v = await getPublishing(deps, owner.id, p.id);
    expect(
      v.targets[0]!.releases[0]!.submissions.map((s) => `${s.attemptNumber}:${s.status}`),
    ).toEqual(["1:rejected", "2:approved"]);
    expect(v.targets[0]!.readiness.requiredVerified).toBeGreaterThanOrEqual(4);

    // RLS: the owner reads everything, a stranger nothing, and clients can never write
    for (const table of [
      "publish_targets",
      "publish_claims",
      "publish_releases",
      "publish_submissions",
      "publish_feedback",
      "publish_actions",
      "publish_events",
    ]) {
      expect((await owner.client.from(table).select("*")).data!.length, table).toBeGreaterThan(0);
      expect((await stranger.client.from(table).select("*")).data, table).toEqual([]);
    }
    expect(
      (await owner.client.from("publish_releases").update({ status: "draft" }).eq("id", rel.id))
        .error,
    ).not.toBeNull();
    expect(
      (
        await owner.client.from("publish_claims").insert({
          target_id: target.id,
          requirement_key: "x",
          kind: "self_reported",
          note: "forged claim from a client",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client
          .from("publish_submissions")
          .insert({ release_id: rel.id, attempt_number: 9 })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client
          .from("publish_events")
          .insert({ project_id: p.id, actor_role: "owner", action: "forged" })
      ).error,
    ).not.toBeNull();

    // the trail is complete and immutable even for the service role
    const trail = (await stores.publishing.listEvents(p.id, 100)).map((e) => e.action);
    expect(trail).toEqual(
      expect.arrayContaining([
        "target_added",
        "release_created",
        "submission_recorded",
        "review_rejected",
        "resubmission_recorded",
        "review_approved",
        "released",
      ]),
    );
    expect(
      (await admin.from("publish_events").update({ action: "tampered" }).eq("project_id", p.id))
        .error,
    ).not.toBeNull();
  }, 60_000);

  it("publishing: a stuck repository blocks readiness in the real stack and nothing the user enters clears it", async () => {
    const owner = await makeUser();
    const { deps, p } = await publishingProject(owner.id, "stuck-app");
    const target = await addTarget(deps, owner.id, p.id, "google_play");
    await saveMetadata(deps, owner.id, target.id, FILL_META);
    for (const k of GOOGLE_CLAIMS)
      await setRequirementClaim(deps, owner.id, target.id, k, {
        kind: "self_reported",
        note: "Completed in Play Console",
      });
    const rel = await createRelease(deps, owner.id, target.id, { version: "1.0.0" });
    await expect(markReleaseReady(deps, owner.id, rel.id)).rejects.toMatchObject({
      code: "conflict",
    });
    const t = (await getPublishing(deps, owner.id, p.id)).targets[0]!;
    expect(t.readiness.blockers.length).toBeGreaterThanOrEqual(3);
    expect(t.readiness.results.find((r) => r.key === "build.ci-passing")!.status).toBe("blocked");
    await expect(
      setRequirementClaim(deps, owner.id, target.id, "build.ci-passing", {
        kind: "self_reported",
        note: "CI is fine I swear",
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  }, 60_000);

  it("publishing: the database release state machine matches the TypeScript one for every status pair", async () => {
    const owner = await makeUser();
    const { p } = await publishingProject(owner.id);
    const target = await stores.publishing.createTarget(p.id, "web", new Date());
    let n = 0;
    const mismatches: string[] = [];
    for (const from of RELEASE_STATUSES) {
      for (const to of RELEASE_STATUSES) {
        if (from === to) continue;
        n++;
        const version = `${n}.0.0`;
        const ins = await admin
          .from("publish_releases")
          .insert({ target_id: target.id, version, status: from })
          .select()
          .single();
        expect(ins.error).toBeNull();
        // a recorded submission exists so only the transition rule itself decides
        await admin.from("publish_submissions").insert({
          release_id: ins.data!.id,
          attempt_number: 1,
          status: ["rejected", "approved", "withdrawn"].includes(from) ? from : "submitted",
        });
        const upd = await admin
          .from("publish_releases")
          .update({ status: to })
          .eq("id", ins.data!.id);
        const dbAllows = upd.error === null;
        if (dbAllows !== RELEASE_TRANSITIONS[from].includes(to))
          mismatches.push(`${from} -> ${to}: db=${dbAllows}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  it("publishing: Publishing Assistance and expert access follow the view_publishing scope on the real stack", async () => {
    const owner = await makeUser();
    const expertUser = await makeUser();
    const adminUser = await makeUser();
    await admin.from("admins").insert({ user_id: adminUser.id });
    const { deps, p } = await publishingProject(owner.id);
    const target = await addTarget(deps, owner.id, p.id, "google_play");
    await saveMetadata(deps, owner.id, target.id, FILL_META);

    const asked = await requestPublishingAssistance(deps, owner.id, p.id, {
      targetId: target.id,
      summary: "Please review my Play listing before I submit",
    });
    const dup = await requestPublishingAssistance(deps, owner.id, p.id, {
      summary: "Asking again should not duplicate it",
    });
    expect([asked.alreadyOpen, dup.alreadyOpen]).toEqual([false, true]);
    expect(asked.request).toMatchObject({ kind: "publishing", publishTargetId: target.id });

    const expert = await applyAsExpert(deps, expertUser.id, {
      displayName: "Pia",
      skills: ["google play"],
    });
    await adminReviewExpert(deps, adminUser.id, expert.id, { decision: "approved" });
    await adminMatch(deps, adminUser.id, asked.request!.id, expert.id);
    expect((await expertUser.client.from("publish_targets").select("id")).data).toEqual([]); // no handoff yet
    await grantHandoff(deps, owner.id, asked.request!.id, { scopes: ["view_findings"], days: 3 });
    expect((await expertUser.client.from("publish_targets").select("id")).data).toEqual([]); // wrong scope
    await revokeHandoff(deps, owner.id, asked.request!.id);
    await grantHandoff(deps, owner.id, asked.request!.id, { scopes: ["view_publishing"], days: 3 });
    expect((await expertUser.client.from("publish_targets").select("id")).data).toHaveLength(1);
    expect(
      (await expertUser.client.from("publish_events").select("id")).data!.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await expertUser.client
          .from("publish_releases")
          .update({ status: "draft" })
          .eq("target_id", target.id)
      ).error,
    ).not.toBeNull(); // experts can read, never write
    const view = await expertWorkspace(deps, expertUser.id, asked.request!.id);
    expect(view.publishing?.targets).toHaveLength(1);
    expect(view.findings).toBeUndefined();
    await revokeHandoff(deps, owner.id, asked.request!.id);
    expect((await expertUser.client.from("publish_targets").select("id")).data).toEqual([]);
  }, 60_000);
});
