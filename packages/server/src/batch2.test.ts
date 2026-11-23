import { describe, expect, it } from "vitest";
import { FakeGitHubGateway, GitHubError, type GitHubGateway } from "@buildapps/github";
import {
  adminListExperts,
  adminMatch,
  adminReviewExpert,
  applyAsExpert,
  askForHumanHelp,
  cancelRequest,
  changeProjectState,
  completeGithubConnect,
  completeRequest,
  createMemoryStores,
  createUserProject,
  decideJobMilestone,
  disconnectGithub,
  expertAccept,
  expertAddJobMilestone,
  expertDecline,
  expertListRequests,
  expertMarkDelivered,
  expertSubmitJobMilestone,
  expertWorkspace,
  getMyRequest,
  getWorkspace,
  grantHandoff,
  handleGithubWebhook,
  linkProjectRepo,
  listConnectionRepos,
  listMyRequests,
  MAX_SCANS_PER_HOUR,
  revokeHandoff,
  runScan,
  runVerification,
  setFindingStatus,
  startGithubConnect,
  WorkspaceError,
  type Deps,
} from "./index";

const SECRET = "s".repeat(32);
function setup(userIds = ["alice"]) {
  const stores = createMemoryStores();
  const gateway = new FakeGitHubGateway();
  let clock = new Date("2026-03-01T10:00:00Z");
  const deps: Deps = { stores, gateway, stateSecret: SECRET, now: () => clock };
  return {
    stores,
    gateway,
    deps,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    userIds,
  };
}
type Ctx = ReturnType<typeof setup>;

async function connect(c: Ctx, user: string) {
  const url = startGithubConnect(c.deps, user).url;
  const state = new URL(url, "http://x").searchParams.get("state")!;
  return completeGithubConnect(c.deps, { state, installationId: 1001, code: "dev" });
}
async function rescueProject(c: Ctx, user: string, repo: "stuck-app" | "healthy-app") {
  const p = await createUserProject(c.stores.projects, user, {
    journey: "rescue",
    name: repo,
    repoUrl: `https://github.com/demo/${repo}`,
    problem: "It is broken after AI changes",
  });
  await changeProjectState(c.stores.projects, user, p.id, "active");
  const { installation } = await connect(c, user);
  await linkProjectRepo(c.deps, user, p.id, installation.id, `demo/${repo}`);
  return { p, installation };
}
const code = async (fn: () => Promise<unknown>) =>
  fn().then(
    () => "ok",
    (e) => (e instanceof WorkspaceError ? e.code : `other:${e}`),
  );

describe("GitHub connection", () => {
  it("connects via signed state + OAuth proof, and rejects forged or expired flows", async () => {
    const c = setup();
    const { installation, userId } = await connect(c, "alice");
    expect(userId).toBe("alice");
    expect(installation).toMatchObject({ installationId: 1001, accountLogin: "demo" });
    const good = new URL(startGithubConnect(c.deps, "alice").url, "http://x").searchParams.get(
      "state",
    )!;
    expect(
      await code(() =>
        completeGithubConnect(c.deps, { state: good, installationId: 1001, code: "wrong" }),
      ),
    ).toBe("forbidden"); // code not proven
    expect(
      await code(() =>
        completeGithubConnect(c.deps, { state: good, installationId: 9999, code: "dev" }),
      ),
    ).toBe("forbidden"); // someone else's installation
    expect(
      await code(() =>
        completeGithubConnect(c.deps, { state: good + "x", installationId: 1001, code: "dev" }),
      ),
    ).toBe("forbidden"); // tampered
    expect(
      await code(() =>
        completeGithubConnect(c.deps, { state: good, installationId: -1, code: "dev" }),
      ),
    ).toBe("invalid");
    c.advance(11 * 60_000);
    expect(
      await code(() =>
        completeGithubConnect(c.deps, { state: good, installationId: 1001, code: "dev" }),
      ),
    ).toBe("forbidden"); // expired
  });

  it("reports unavailable when no GitHub App is configured", async () => {
    const c = setup();
    const off: Deps = { ...c.deps, gateway: null };
    expect(() => startGithubConnect(off, "alice")).toThrow(WorkspaceError);
    const p = await createUserProject(c.stores.projects, "alice", {
      journey: "start",
      name: "x",
      idea: "a habit tracker app",
      platform: "web",
    });
    expect(await code(() => runScan(off, "alice", p.id))).toBe("unavailable");
  });

  it("links only repositories the user shared, enforces ownership and one repo per project", async () => {
    const c = setup();
    const { p, installation } = await rescueProject(c, "alice", "stuck-app");
    expect(
      (await listConnectionRepos(c.deps, "alice", installation.id)).map((r) => r.fullName),
    ).toContain("demo/stuck-app");
    expect(
      await code(() => linkProjectRepo(c.deps, "alice", p.id, installation.id, "demo/healthy-app")),
    ).toBe("conflict"); // project is for stuck-app
    const other = await createUserProject(c.stores.projects, "alice", {
      journey: "start",
      name: "o",
      idea: "something new to build",
      platform: "web",
    });
    expect(
      await code(() =>
        linkProjectRepo(c.deps, "alice", other.id, installation.id, "demo/not-shared"),
      ),
    ).toBe("forbidden");
    expect(
      await code(() =>
        linkProjectRepo(c.deps, "alice", other.id, installation.id, "../etc/passwd"),
      ),
    ).toBe("invalid");
    expect(await code(() => listConnectionRepos(c.deps, "mallory", installation.id))).toBe(
      "not_found",
    ); // another user's connection
    expect(
      await code(() => linkProjectRepo(c.deps, "mallory", p.id, installation.id, "demo/stuck-app")),
    ).toBe("not_found");
  });

  it("disconnect revokes at GitHub, unlinks projects and stops scans", async () => {
    const c = setup();
    const { p, installation } = await rescueProject(c, "alice", "stuck-app");
    const out = await disconnectGithub(c.deps, "alice", installation.id);
    expect(out).toMatchObject({ removed: true, remoteRevoked: true });
    expect(c.gateway.uninstalled.has(1001)).toBe(true);
    expect((await c.stores.projects.getGithubLink("alice", p.id)).installationRowId).toBeNull();
    expect(await code(() => runScan(c.deps, "alice", p.id))).toBe("not_connected");
    expect(await code(() => disconnectGithub(c.deps, "alice", installation.id))).toBe("not_found");
  });

  it("does not uninstall a shared installation still used by another account", async () => {
    const c = setup();
    const a = await connect(c, "alice");
    await connect(c, "bob");
    const out = await disconnectGithub(c.deps, "alice", a.installation.id);
    expect(out.remoteRevoked).toBe(false);
    expect(out.note).toMatch(/Another BuildApps account/);
    expect(c.gateway.uninstalled.size).toBe(0);
  });

  it("reports (not hides) a failed remote revocation but still removes the local link", async () => {
    const c = setup();
    const { installation } = await rescueProject(c, "alice", "stuck-app");
    const failing: GitHubGateway = Object.assign(Object.create(c.gateway), {
      uninstall: async () => {
        throw new GitHubError(500, "boom");
      },
    });
    const out = await disconnectGithub({ ...c.deps, gateway: failing }, "alice", installation.id);
    expect(out.remoteRevoked).toBe(false);
    expect(out.note).toMatch(/github.com\/settings\/installations/);
    expect(await c.stores.github.listInstallations("alice")).toEqual([]);
  });

  it("webhooks: uninstall and repository removal unlink projects", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    expect(await handleGithubWebhook(c.deps, "ping", {})).toEqual({ handled: false });
    await handleGithubWebhook(c.deps, "installation_repositories", {
      action: "removed",
      installation: { id: 1001 },
      repositories_removed: [{ full_name: "demo/stuck-app" }],
    });
    expect((await c.stores.projects.getGithubLink("alice", p.id)).installationRowId).toBeNull();
    await handleGithubWebhook(c.deps, "installation", {
      action: "deleted",
      installation: { id: 1001 },
    });
    expect(await c.stores.github.listInstallations("alice")).toEqual([]);
  });
});

describe("scanner service + verification evidence", () => {
  it("scans a stuck repo: stores labelled findings and verifies only what evidence supports", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    const out = await runScan(c.deps, "alice", p.id);
    expect(out.sync.new).toBeGreaterThan(5);
    const findings = await c.stores.scans.listFindings(p.id);
    expect(findings.find((f) => f.ruleId === "env-file-committed")).toMatchObject({
      kind: "verified",
      severity: "critical",
      milestoneKey: "fix-blockers",
      status: "open",
    });
    expect(findings.find((f) => f.ruleId === "hardcoded-secret")?.kind).toBe("static_warning");
    expect(JSON.stringify(findings)).not.toContain("Zq81LmN4pR7sT0uVwX2yAb3C"); // secrets never stored
    const proj = (await c.stores.projects.get("alice", p.id))!;
    const m = (k: string) => proj.milestones.find((x) => x.id === k)!;
    expect(m("assess").completion).toMatchObject({
      source: "verified",
      evidenceRef: `scan:${out.scan.id}`,
    });
    expect(m("fix-blockers").status).toBe("todo"); // blockers remain
    expect(m("tests-pass").status).toBe("todo");
    expect(out.verified.map((v) => v.milestoneKey)).toEqual(["assess"]);
    const state = await c.stores.progress.load("alice", "");
    expect(state.totalXp).toBeGreaterThanOrEqual(50);
    expect(state.earnedAchievements.has("first-verified-milestone")).toBe(true);
  });

  it("is idempotent: rescanning duplicates neither findings nor XP", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    const before = {
      f: (await c.stores.scans.listFindings(p.id)).length,
      xp: (await c.stores.progress.load("alice", "")).totalXp,
    };
    const second = await runScan(c.deps, "alice", p.id);
    expect(second.sync).toEqual({ new: 0, reopened: 0, resolved: 0 });
    expect(second.verified).toEqual([]);
    expect({
      f: (await c.stores.scans.listFindings(p.id)).length,
      xp: (await c.stores.progress.load("alice", "")).totalXp,
    }).toEqual(before);
  });

  it("fix-blockers is verified only after a rescan confirms serious findings are gone", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    const serious = (await c.stores.scans.listFindings(p.id)).filter((f) =>
      ["critical", "high"].includes(f.severity),
    );
    expect(serious.length).toBeGreaterThan(0);

    // user CLAIMS everything is fixed and dismisses one: neither counts as evidence
    await setFindingStatus(c.deps, "alice", p.id, serious[0]!.id, {
      status: "dismissed",
      note: "accepted risk for now",
    });
    for (const f of serious.slice(1))
      await setFindingStatus(c.deps, "alice", p.id, f.id, { status: "resolved" });
    const stillBlocked = await runScan(c.deps, "alice", p.id); // repo unchanged => claims contradicted
    expect(stillBlocked.verified.map((v) => v.milestoneKey)).not.toContain("fix-blockers");
    const after = await c.stores.scans.listFindings(p.id);
    expect(after.find((f) => f.id === serious[0]!.id)).toMatchObject({
      status: "dismissed",
      statusNote: "accepted risk for now",
      decidedByUser: true,
    }); // decision preserved
    expect(
      after
        .filter((f) => serious.slice(1).some((s) => s.id === f.id))
        .every((f) => f.status === "open"),
    ).toBe(true); // claims reopened

    // actually fix the repository
    const repo = c.gateway.repos.find((r) => r.info.name === "stuck-app")!;
    delete repo.files[".env"];
    repo.files["src/lib/pay.ts"] = "export function refund() { return 1; }\n";
    repo.files["src/api/search.ts"] =
      "export async function find(q) { return db.query('SELECT * FROM items WHERE name = $1', [q]); }\n";
    c.advance(60_000);
    const fixed = await runScan(c.deps, "alice", p.id);
    const final = await c.stores.scans.listFindings(p.id);
    expect(
      final.filter((f) => f.status === "resolved" && f.resolutionSource === "rescan").length,
    ).toBeGreaterThan(0);
    // the user's dismissal is preserved as their decision, but the issue is genuinely gone from the repo,
    // so the latest scan no longer sees it and it stops blocking verification
    const gone = final.find((f) => f.id === serious[0]!.id)!;
    expect(gone).toMatchObject({ status: "dismissed", statusNote: "accepted risk for now" });
    expect(gone.lastSeenScan).not.toBe(fixed.scan.id);
    expect(fixed.verified.map((v) => v.milestoneKey)).toContain("fix-blockers");
    const wsx = await getWorkspace(c.deps, "alice", p.id);
    expect(wsx.readiness.blockers.some((b) => b.includes("critical/high"))).toBe(false);
  });

  it("a dismissed serious finding that still exists keeps blocking verification", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    const serious = (await c.stores.scans.listFindings(p.id)).filter((f) =>
      ["critical", "high"].includes(f.severity),
    );
    for (const f of serious)
      await setFindingStatus(c.deps, "alice", p.id, f.id, {
        status: "dismissed",
        note: "we accept all of these",
      });
    const again = await runScan(c.deps, "alice", p.id);
    expect(again.verified.map((v) => v.milestoneKey)).not.toContain("fix-blockers");
    expect((await getWorkspace(c.deps, "alice", p.id)).readiness.ready).toBe(false);
  });

  it("verification: CI + static evidence verifies tests/build milestones, and failing CI does not", async () => {
    const c = setup();
    const stuck = await rescueProject(c, "alice", "stuck-app");
    const bad = await runVerification(c.deps, "alice", stuck.p.id);
    expect(bad.run.checks.find((k) => k.id === "ci.green")?.status).toBe("fail");
    expect(bad.run.checks.find((k) => k.id === "sandbox.tests")?.status).toBe("unavailable");
    expect(bad.verified.map((v) => v.milestoneKey)).not.toContain("tests-pass");
    expect(bad.verified.map((v) => v.milestoneKey)).not.toContain("restore-build");

    const c2 = setup();
    const ok = await rescueProject(c2, "bob", "healthy-app");
    const good = await runVerification(c2.deps, "bob", ok.p.id);
    expect(good.verified.map((v) => v.milestoneKey).sort()).toEqual([
      "assess",
      "fix-blockers",
      "restore-build",
      "tests-pass",
    ]);
    const proj = (await c2.stores.projects.get("bob", ok.p.id))!;
    expect(proj.milestones.find((m) => m.id === "tests-pass")?.completion).toMatchObject({
      source: "verified",
      evidenceRef: `verification:${good.run.id}`,
    });
    const w = await getWorkspace(c2.deps, "bob", ok.p.id);
    expect(w.readiness).toMatchObject({ ready: true, blockers: [] });
    expect(w.progress.completion).toBe("verified");
    expect((await c2.stores.progress.load("bob", "")).verifiedMilestones).toBe(4);
  });

  it("verification requires the project to be active and never verifies from a draft", async () => {
    const c = setup();
    const p = await createUserProject(c.stores.projects, "alice", {
      journey: "rescue",
      name: "d",
      repoUrl: "https://github.com/demo/healthy-app",
      problem: "just created, not started",
    });
    const { installation } = await connect(c, "alice");
    await linkProjectRepo(c.deps, "alice", p.id, installation.id, "demo/healthy-app");
    const out = await runScan(c.deps, "alice", p.id);
    expect(out.verified).toEqual([]);
    expect(
      (await c.stores.projects.get("alice", p.id))!.milestones.every((m) => m.status === "todo"),
    ).toBe(true);
  });

  it("rate-limits scans per project per hour", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "healthy-app");
    for (let i = 0; i < MAX_SCANS_PER_HOUR; i++) await runScan(c.deps, "alice", p.id);
    expect(await code(() => runScan(c.deps, "alice", p.id))).toBe("rate_limited");
    c.advance(61 * 60_000);
    expect(await code(() => runScan(c.deps, "alice", p.id))).toBe("ok");
  });

  it("records a failed scan without touching findings when GitHub denies access", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    const before = await c.stores.scans.listFindings(p.id);
    const denied: GitHubGateway = Object.assign(Object.create(c.gateway), {
      getSnapshot: async () => {
        throw new GitHubError(403, "nope");
      },
    });
    expect(await code(() => runScan({ ...c.deps, gateway: denied }, "alice", p.id))).toBe(
      "not_connected",
    );
    expect(await c.stores.scans.listFindings(p.id)).toEqual(before);
    const failed = [...c.stores.db.scans.values()].filter((s) => s.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).not.toMatch(/token|ghs_|Bearer/i);
  });

  it("isolates projects between users", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    expect(await code(() => runScan(c.deps, "mallory", p.id))).toBe("not_found");
    expect(await code(() => getWorkspace(c.deps, "mallory", p.id))).toBe("not_found");
    const f = (await c.stores.scans.listFindings(p.id))[0]!;
    expect(
      await code(() => setFindingStatus(c.deps, "mallory", p.id, f.id, { status: "open" })),
    ).toBe("not_found");
  });

  it("validates finding status changes", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    const f = (await c.stores.scans.listFindings(p.id))[0]!;
    expect(
      await code(() => setFindingStatus(c.deps, "alice", p.id, f.id, { status: "dismissed" })),
    ).toBe("invalid"); // reason required
    expect(
      await code(() => setFindingStatus(c.deps, "alice", p.id, f.id, { status: "bogus" })),
    ).toBe("invalid");
    expect(
      await code(() => setFindingStatus(c.deps, "alice", p.id, "nope", { status: "open" })),
    ).toBe("not_found");
    const done = await setFindingStatus(c.deps, "alice", p.id, f.id, { status: "resolved" });
    expect(done).toMatchObject({
      status: "resolved",
      resolutionSource: "user",
      decidedByUser: true,
    });
    expect(await setFindingStatus(c.deps, "alice", p.id, f.id, { status: "open" })).toMatchObject({
      status: "open",
      decidedByUser: false,
      resolutionSource: null,
    });
  });
});

describe("Human Developer Rescue", () => {
  async function matchedJob() {
    const c = setup();
    c.stores.db.admins.add("admin");
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await runScan(c.deps, "alice", p.id);
    await askForHumanHelp(c.stores.projects, "alice", p.id, "Please help me fix this broken build");
    const req = (await listMyRequests(c.deps, "alice"))[0]!.request;
    const expert = await applyAsExpert(c.deps, "dana", {
      displayName: "Dana",
      headline: "Full-stack rescue",
      skills: ["next", "supabase"],
    });
    await adminReviewExpert(c.deps, "admin", expert.id, { decision: "approved" });
    await adminMatch(c.deps, "admin", req.id, expert.id);
    return { c, p, req, expert };
  }

  it("experts are vetted by an administrator before they can be matched", async () => {
    const c = setup();
    c.stores.db.admins.add("admin");
    const e = await applyAsExpert(c.deps, "dana", { displayName: "Dana", skills: ["a"] });
    expect(e.status).toBe("pending");
    expect(await code(() => adminListExperts(c.deps, "dana"))).toBe("forbidden");
    expect(
      await code(() => adminReviewExpert(c.deps, "dana", e.id, { decision: "approved" })),
    ).toBe("forbidden"); // cannot self-approve
    expect(await code(() => applyAsExpert(c.deps, "x", { displayName: "" }))).toBe("invalid");
    c.stores.db.admins.add("dana");
    expect(
      await code(() => adminReviewExpert(c.deps, "dana", e.id, { decision: "approved" })),
    ).toBe("forbidden"); // admins cannot approve themselves
    c.stores.db.admins.delete("dana");

    const { p } = await rescueProject(c, "alice", "stuck-app");
    await askForHumanHelp(c.stores.projects, "alice", p.id, "Please help me fix this broken build");
    const req = (await c.stores.rescue.listAllRequests())[0]!;
    expect(await code(() => adminMatch(c.deps, "admin", req.id, e.id))).toBe("conflict"); // still pending
    await adminReviewExpert(c.deps, "admin", e.id, {
      decision: "approved",
      note: "verified portfolio",
    });
    expect((await adminListExperts(c.deps, "admin", "approved")).length).toBe(1);
    expect(await code(() => adminMatch(c.deps, "admin", req.id, e.id))).toBe("ok");
    expect(await code(() => adminMatch(c.deps, "admin", req.id, e.id))).toBe("conflict"); // already matched
  });

  it("an expert cannot be matched to their own project", async () => {
    const c = setup();
    c.stores.db.admins.add("admin");
    const e = await applyAsExpert(c.deps, "alice", { displayName: "Alice" });
    await adminReviewExpert(c.deps, "admin", e.id, { decision: "approved" });
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await askForHumanHelp(c.stores.projects, "alice", p.id, "Please help me fix this broken build");
    const req = (await c.stores.rescue.listAllRequests())[0]!;
    expect(await code(() => adminMatch(c.deps, "admin", req.id, e.id))).toBe("conflict");
  });

  it("handoffs are scoped, time-limited and revocable; experts never see more than was granted", async () => {
    const { c, req } = await matchedJob();
    expect(await code(() => expertWorkspace(c.deps, "dana", req.id))).toBe("forbidden"); // nothing granted yet
    expect(await code(() => grantHandoff(c.deps, "alice", req.id, { scopes: [], days: 7 }))).toBe(
      "invalid",
    );
    expect(
      await code(() =>
        grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"], days: 31 }),
      ),
    ).toBe("invalid");
    expect(
      await code(() =>
        grantHandoff(c.deps, "alice", req.id, { scopes: ["view_source_code"], days: 7 }),
      ),
    ).toBe("invalid");
    expect(
      await code(() => grantHandoff(c.deps, "mallory", req.id, { scopes: ["view_findings"] })),
    ).toBe("not_found");

    await grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"], days: 7 });
    expect(
      await code(() => grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"] })),
    ).toBe("conflict"); // one active handoff
    const w = await expertWorkspace(c.deps, "dana", req.id);
    expect(w.findings?.length).toBeGreaterThan(0);
    expect(w.project).toBeUndefined(); // view_project not granted
    expect(w.scan).toBeUndefined();
    expect(w.verification).toBeUndefined();
    expect(JSON.stringify(w)).not.toMatch(/Zq81LmN4pR7sT0uVwX2yAb3C|sk_live_Zq/); // no credentials, ever

    // owner revokes -> immediate
    expect(await revokeHandoff(c.deps, "alice", req.id)).toEqual({ revoked: 1 });
    expect(await code(() => expertWorkspace(c.deps, "dana", req.id))).toBe("forbidden");

    // re-grant with more scopes, then let it expire
    await grantHandoff(c.deps, "alice", req.id, {
      scopes: ["view_project", "view_scans", "view_verification", "view_findings"],
      days: 2,
    });
    const full = await expertWorkspace(c.deps, "dana", req.id);
    expect(full.project?.name).toBe("stuck-app");
    expect(full.scan).toBeTruthy();
    c.advance(3 * 86_400_000);
    expect(await code(() => expertWorkspace(c.deps, "dana", req.id))).toBe("forbidden"); // expired
    expect((await getMyRequest(c.deps, "alice", req.id)).handoff).toBeNull();
  });

  it("access ends immediately when an expert is suspended", async () => {
    const { c, req, expert } = await matchedJob();
    await grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"] });
    expect((await expertWorkspace(c.deps, "dana", req.id)).findings).toBeTruthy();
    await adminReviewExpert(c.deps, "admin", expert.id, {
      decision: "suspended",
      note: "complaint",
    });
    expect(await code(() => expertWorkspace(c.deps, "dana", req.id))).toBe("not_found");
    expect(await c.stores.rescue.activeHandoff(req.id)).toBeNull();
    expect(await expertListRequests(c.deps, "dana")).toEqual([]);
  });

  it("job lifecycle: accept, milestones, deliverables, owner acceptance, verified completion", async () => {
    const { c, req } = await matchedJob();
    expect(await code(() => expertAccept(c.deps, "stranger", req.id))).toBe("not_found");
    expect(await code(() => expertMarkDelivered(c.deps, "dana", req.id))).toBe("conflict"); // not accepted yet
    await expertAccept(c.deps, "dana", req.id);
    const j1 = await expertAddJobMilestone(c.deps, "dana", req.id, {
      title: "Remove committed secrets",
      description: "rotate keys",
    });
    const j2 = await expertAddJobMilestone(c.deps, "dana", req.id, { title: "Restore the build" });
    expect(await code(() => expertMarkDelivered(c.deps, "dana", req.id))).toBe("conflict"); // nothing submitted
    expect(
      await code(() =>
        expertSubmitJobMilestone(c.deps, "dana", req.id, j1.id, {
          note: "done",
          url: "http://insecure",
        }),
      ),
    ).toBe("invalid");
    await expertSubmitJobMilestone(c.deps, "dana", req.id, j1.id, {
      note: "Removed .env and rotated the Stripe key",
      url: "https://github.com/demo/stuck-app/pull/1",
    });
    await expertSubmitJobMilestone(c.deps, "dana", req.id, j2.id, {
      note: "Build passes locally and in CI",
    });
    await expertMarkDelivered(c.deps, "dana", req.id);

    expect(await code(() => completeRequest(c.deps, "alice", req.id))).toBe("conflict"); // owner has not accepted
    expect(
      await code(() => decideJobMilestone(c.deps, "alice", req.id, j1.id, { decision: "reject" })),
    ).toBe("invalid"); // reason required
    await decideJobMilestone(c.deps, "alice", req.id, j1.id, {
      decision: "reject",
      note: "key still in history",
    });
    expect((await c.stores.rescue.getRequest(req.id))!.status).toBe("in_progress"); // rejection reopens the job
    expect(await code(() => completeRequest(c.deps, "alice", req.id))).toBe("conflict");
    await expertSubmitJobMilestone(c.deps, "dana", req.id, j1.id, {
      note: "History purged with filter-repo",
    }); // resubmission after rejection
    await expertMarkDelivered(c.deps, "dana", req.id);
    await decideJobMilestone(c.deps, "alice", req.id, j1.id, { decision: "accept" });
    await decideJobMilestone(c.deps, "alice", req.id, j2.id, { decision: "accept" });
    expect(await code(() => completeRequest(c.deps, "dana", req.id))).toBe("not_found"); // only the owner completes
    const done = await completeRequest(c.deps, "alice", req.id);
    expect(done.status).toBe("completed");
    expect(done.completionEvidence).toMatchObject({ acceptedMilestones: 2 });
    expect(done.completionEvidence?.latestScanId).toBeTruthy();
    expect(await c.stores.rescue.activeHandoff(req.id)).toBeNull();
    expect(await code(() => expertAddJobMilestone(c.deps, "dana", req.id, { title: "late" }))).toBe(
      "conflict",
    );
  });

  it("decline returns the request to the pool; cancel revokes access", async () => {
    const { c, req } = await matchedJob();
    await grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"] });
    await expertDecline(c.deps, "dana", req.id);
    const r = (await c.stores.rescue.getRequest(req.id))!;
    expect(r).toMatchObject({ status: "submitted", assignedExpertId: null });
    expect(await c.stores.rescue.activeHandoff(req.id)).toBeNull();
    await adminMatch(
      c.deps,
      "admin",
      req.id,
      (await c.stores.rescue.listExperts("approved"))[0]!.id,
    );
    await grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"] });
    await cancelRequest(c.deps, "alice", req.id);
    expect(await code(() => expertWorkspace(c.deps, "dana", req.id))).toBe("forbidden");
    expect(await code(() => cancelRequest(c.deps, "alice", req.id))).toBe("conflict");
  });

  it("owners cannot grant a handoff before a match, and strangers cannot read requests", async () => {
    const c = setup();
    const { p } = await rescueProject(c, "alice", "stuck-app");
    await askForHumanHelp(c.stores.projects, "alice", p.id, "Please help me fix this broken build");
    const req = (await c.stores.rescue.listAllRequests())[0]!;
    expect(
      await code(() => grantHandoff(c.deps, "alice", req.id, { scopes: ["view_findings"] })),
    ).toBe("conflict");
    expect(await code(() => getMyRequest(c.deps, "mallory", req.id))).toBe("not_found");
  });
});
