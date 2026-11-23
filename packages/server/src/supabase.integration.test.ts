import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { curriculum } from "@buildapps/lessons";
import {
  advanceProjectRecovery,
  askForHumanHelp,
  changeProjectState,
  createSupabaseStores,
  createUserProject,
  getDashboard,
  reportMilestone,
  submitAttempt,
  verifyAccessToken,
  type Stores,
} from "./index";

/**
 * Runs against a REAL local Supabase (`supabase start`), never against cloud projects.
 * Requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY; skipped otherwise.
 */
const {
  SUPABASE_URL: URL,
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
} = process.env;
const enabled = Boolean(URL && ANON && SERVICE);

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
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    const token = s.session!.access_token;
    const client = createClient(URL!, ANON!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const u = { id: data.user.id, client, token };
    users.push(u);
    return u;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE!, {
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
    expect(await verifyAccessToken(URL!, ANON!, u.token)).toBe(u.id);
    expect(await verifyAccessToken(URL!, ANON!, "not-a-token")).toBeNull();
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
});
