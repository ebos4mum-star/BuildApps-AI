import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Milestone,
  Project,
  ProjectJourney,
  ProjectState,
  RepoRef,
  RescueStage,
} from "@buildapps/core";
import { INITIAL_STREAK } from "@buildapps/core";
import { SupabaseGitHubStore, SupabaseRescueStore, SupabaseScanStore } from "./supabase-store2";
import { SupabasePublishingStore } from "./supabase-store3";
import type {
  ApplyAttemptInput,
  ApplyAttemptResult,
  ProgressState,
  ProgressStore,
  ProjectStore,
  Stores,
} from "./store";

/**
 * Supabase implementations. These MUST be given a service-role client and are only ever
 * constructed in server code (route handlers / edge functions). RLS protects direct client access;
 * the service role is what lets the server write progression data.
 */
function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export class SupabaseProgressStore implements ProgressStore {
  constructor(private readonly db: SupabaseClient) {}

  async load(userId: string, exerciseId: string): Promise<ProgressState> {
    await this.db
      .from("user_progress")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const [progress, profile, completions, awards, achievements, attempts, verified] =
      await Promise.all([
        this.db.from("user_progress").select("*").eq("user_id", userId).single(),
        this.db.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
        this.db.from("exercise_completions").select("exercise_id").eq("user_id", userId),
        this.db
          .from("xp_awards")
          .select("award_key, source, xp, occurred_at")
          .eq("user_id", userId),
        this.db.from("achievements_earned").select("achievement_id").eq("user_id", userId),
        this.db
          .from("challenge_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId),
        this.db
          .from("project_milestones")
          .select("id, projects!inner(owner_id)", { count: "exact", head: true })
          .eq("completion_source", "verified")
          .eq("projects.owner_id", userId),
      ]);
    fail("load progress", progress.error);
    fail("load profile", profile.error);
    fail("load completions", completions.error);
    fail("load awards", awards.error);
    fail("load achievements", achievements.error);
    fail("load attempts", attempts.error);
    fail("load verified", verified.error);
    const p = progress.data;
    const cutoff = Date.now() - 3 * 86_400_000;
    return {
      passedExerciseIds: new Set((completions.data ?? []).map((r) => r.exercise_id as string)),
      awardKeys: new Set((awards.data ?? []).map((r) => r.award_key as string)),
      recentExerciseAwards: (awards.data ?? [])
        .filter((r) => r.source === "exercise" && Date.parse(r.occurred_at as string) >= cutoff)
        .map((r) => ({ occurredAt: r.occurred_at as string, xp: r.xp as number })),
      totalXp: p.total_xp,
      streak: {
        ...INITIAL_STREAK,
        current: p.current_streak,
        longest: p.longest_streak,
        lastActiveDay: p.last_active_day,
        restDaysAvailable: p.rest_days_available,
      },
      version: p.version,
      earnedAchievements: new Set((achievements.data ?? []).map((r) => r.achievement_id as string)),
      timeZone: profile.data?.timezone ?? "UTC",
      verifiedMilestones: verified.count ?? 0,
      verifiedProjectsCompleted: await this.countVerifiedCompletedProjects(userId),
      priorAttempts: attempts.count ?? 0,
    };
  }

  private async countVerifiedCompletedProjects(userId: string): Promise<number> {
    const { data, error } = await this.db
      .from("projects")
      .select("id, project_milestones(required, weight, status, completion_source)")
      .eq("owner_id", userId)
      .eq("state", "completed");
    fail("load completed projects", error);
    type M = {
      required: boolean;
      weight: number;
      status: string;
      completion_source: string | null;
    };
    return (data as { project_milestones: M[] }[]).filter((p) => {
      const req = p.project_milestones.filter((m) => m.required);
      return (
        req.length > 0 &&
        req.every((m) => m.status === "done" && m.completion_source === "verified")
      );
    }).length;
  }

  async grant(i: { userId: string; awards: ApplyAttemptInput["awards"]; achievements: string[] }) {
    const { data, error } = await this.db.rpc("award_xp", {
      p_user_id: i.userId,
      p_awards: i.awards.map((a) => ({
        award_key: a.awardKey,
        source: a.source,
        xp: a.xp,
        occurred_at: a.occurredAt,
      })),
      p_achievements: i.achievements,
    });
    fail("award_xp", error);
    return { xpAdded: data.xp_added as number, totalXp: data.total_xp as number };
  }

  async apply(i: ApplyAttemptInput): Promise<ApplyAttemptResult> {
    const { data, error } = await this.db.rpc("apply_attempt", {
      p_user_id: i.userId,
      p_exercise_id: i.exerciseId,
      p_passed: i.passed,
      p_expected_version: i.expectedVersion,
      p_awards: i.awards.map((a) => ({
        award_key: a.awardKey,
        source: a.source,
        xp: a.xp,
        occurred_at: a.occurredAt,
      })),
      p_achievements: i.achievements,
      p_streak: {
        current: i.streak.current,
        longest: i.streak.longest,
        last_active_day: i.streak.lastActiveDay,
        rest_days_available: i.streak.restDaysAvailable,
      },
    });
    fail("apply_attempt", error);
    if (data.status === "conflict") return { status: "conflict" };
    return { status: "ok", xpAdded: data.xp_added, totalXp: data.total_xp };
  }

  async setTimeZone(userId: string, tz: string) {
    const { error } = await this.db.from("profiles").update({ timezone: tz }).eq("id", userId);
    fail("set timezone", error);
  }
}

type MilestoneRow = {
  key: string;
  title: string;
  required: boolean;
  weight: number;
  position: number;
  status: Milestone["status"];
  completion_source: "user_reported" | "verified" | null;
  evidence_ref: string | null;
  completed_at: string | null;
};
type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  journey: ProjectJourney;
  state: ProjectState;
  repo_owner: string | null;
  repo_name: string | null;
  recovery_stage: RescueStage | null;
  human_help_requested: boolean;
  created_at: string;
  updated_at: string;
  project_milestones: MilestoneRow[];
};

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  journey: r.journey,
  state: r.state,
  repo:
    r.repo_owner && r.repo_name
      ? { provider: "github", owner: r.repo_owner, name: r.repo_name }
      : null,
  recovery: r.recovery_stage
    ? { stage: r.recovery_stage, humanHelpRequested: r.human_help_requested }
    : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  milestones: [...r.project_milestones]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.key,
      title: m.title,
      required: m.required,
      weight: m.weight,
      status: m.status,
      completion:
        m.completion_source && m.completed_at
          ? {
              source: m.completion_source,
              at: m.completed_at,
              ...(m.evidence_ref ? { evidenceRef: m.evidence_ref } : {}),
            }
          : null,
    })),
});

export class SupabaseProjectStore implements ProjectStore {
  constructor(private readonly db: SupabaseClient) {}

  async create(p: Project) {
    const { error } = await this.db.from("projects").insert({
      id: p.id,
      owner_id: p.ownerId,
      name: p.name,
      journey: p.journey,
      state: p.state,
      repo_owner: p.repo?.owner ?? null,
      repo_name: p.repo?.name ?? null,
      recovery_stage: p.recovery?.stage ?? null,
      human_help_requested: p.recovery?.humanHelpRequested ?? false,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    });
    fail("create project", error);
    const { error: mErr } = await this.db.from("project_milestones").insert(
      p.milestones.map((m, position) => ({
        project_id: p.id,
        key: m.id,
        title: m.title,
        required: m.required,
        weight: m.weight,
        position,
      })),
    );
    if (mErr) {
      await this.db.from("projects").delete().eq("id", p.id); // best-effort rollback
      fail("create milestones", mErr);
    }
  }

  async list(ownerId: string) {
    const { data, error } = await this.db
      .from("projects")
      .select("*, project_milestones(*)")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });
    fail("list projects", error);
    return (data as ProjectRow[]).map(toProject);
  }

  async get(ownerId: string, id: string) {
    const { data, error } = await this.db
      .from("projects")
      .select("*, project_milestones(*)")
      .eq("owner_id", ownerId)
      .eq("id", id)
      .maybeSingle();
    fail("get project", error);
    return data ? toProject(data as ProjectRow) : null;
  }

  async getGithubLink(ownerId: string, projectId: string) {
    const { data, error } = await this.db
      .from("projects")
      .select("github_installation_id")
      .eq("id", projectId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    fail("get github link", error);
    return {
      installationRowId: (data?.github_installation_id as string | null | undefined) ?? null,
    };
  }

  async setRepo(ownerId: string, projectId: string, repo: RepoRef, installationRowId: string) {
    const { error } = await this.db
      .from("projects")
      .update({
        repo_owner: repo.owner,
        repo_name: repo.name,
        github_installation_id: installationRowId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("owner_id", ownerId);
    fail("set repo", error);
  }

  async unlinkRepo(githubInstallationId: number, owner: string, name: string) {
    const { data, error } = await this.db
      .from("github_installations")
      .select("id")
      .eq("installation_id", githubInstallationId);
    fail("find installations", error);
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length === 0) return;
    const { error: e2 } = await this.db
      .from("projects")
      .update({ github_installation_id: null })
      .in("github_installation_id", ids)
      .eq("repo_owner", owner)
      .eq("repo_name", name);
    fail("unlink repo", e2);
  }

  async hasOpenServiceRequest(ownerId: string, projectId: string, kind?: "rescue" | "publishing") {
    let q = this.db
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", ownerId)
      .eq("project_id", projectId)
      .in("status", ["submitted", "matched", "in_progress", "delivered"]);
    if (kind) q = q.eq("kind", kind);
    const { count, error } = await q;
    fail("check open requests", error);
    return (count ?? 0) > 0;
  }

  async createServiceRequest(
    ownerId: string,
    projectId: string,
    summary: string,
    opts: { kind?: "rescue" | "publishing"; publishTargetId?: string | null } = {},
  ) {
    const { data, error } = await this.db
      .from("service_requests")
      .insert({
        project_id: projectId,
        requester_id: ownerId,
        summary,
        kind: opts.kind ?? "rescue",
        publish_target_id: opts.publishTargetId ?? null,
      })
      .select("id")
      .single();
    fail("create service request", error);
    const ev = await this.db.from("request_events").insert({
      service_request_id: data.id,
      actor_id: ownerId,
      actor_role: "owner",
      action: "request_created",
      detail: {},
    });
    fail("log request event", ev.error);
    return data.id as string;
  }

  async save(p: Project) {
    const { error } = await this.db
      .from("projects")
      .update({
        state: p.state,
        recovery_stage: p.recovery?.stage ?? null,
        human_help_requested: p.recovery?.humanHelpRequested ?? false,
        updated_at: p.updatedAt,
      })
      .eq("id", p.id)
      .eq("owner_id", p.ownerId);
    fail("save project", error);
    for (const m of p.milestones) {
      const { error: e } = await this.db
        .from("project_milestones")
        .update({
          status: m.status,
          completion_source: m.completion?.source ?? null,
          evidence_ref: m.completion?.evidenceRef ?? null,
          completed_at: m.completion?.at ?? null,
        })
        .eq("project_id", p.id)
        .eq("key", m.id);
      fail("save milestone", e);
    }
  }
}

export const createSupabaseStores = (serviceClient: SupabaseClient): Stores => ({
  progress: new SupabaseProgressStore(serviceClient),
  projects: new SupabaseProjectStore(serviceClient),
  github: new SupabaseGitHubStore(serviceClient),
  scans: new SupabaseScanStore(serviceClient),
  rescue: new SupabaseRescueStore(serviceClient),
  publishing: new SupabasePublishingStore(serviceClient),
});
