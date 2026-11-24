import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerProfile } from "@buildapps/core";
import type { ProfileStore, StoredProfile } from "./store";

export class MemoryProfileStore implements ProfileStore {
  rows = new Map<string, StoredProfile>();
  async get(userId: string) {
    const r = this.rows.get(userId);
    return r ? structuredClone(r) : null;
  }
  async save(userId: string, profile: LearnerProfile, now: Date) {
    const prev = this.rows.get(userId);
    const row: StoredProfile = {
      profile: structuredClone(profile),
      placedOut: prev?.placedOut ?? [],
      completedAt: prev?.completedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.rows.set(userId, row);
    return structuredClone(row);
  }
  async addPlacedOut(userId: string, skillId: string, now: Date) {
    const r = this.rows.get(userId);
    if (!r) throw new Error("add placement: no profile");
    if (!r.placedOut.includes(skillId)) r.placedOut.push(skillId);
    r.updatedAt = now.toISOString();
  }
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw PostgREST rows
const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};
const toStored = (r: R): StoredProfile => ({
  profile: {
    experience: r.experience,
    goals: r.goals,
    tools: r.tools,
    intent: r.intent,
    pace: r.pace,
    projectTypes: r.project_types,
    platforms: r.platforms,
    reminders: { enabled: r.reminders_enabled, hour: r.reminder_hour },
  },
  placedOut: r.placed_out ?? [],
  completedAt: r.completed_at,
  updatedAt: r.updated_at,
});

export class SupabaseProfileStore implements ProfileStore {
  constructor(private readonly db: SupabaseClient) {}
  async get(userId: string) {
    const { data, error } = await this.db
      .from("learner_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    fail("get profile", error);
    return data ? toStored(data) : null;
  }
  async save(userId: string, p: LearnerProfile, now: Date) {
    // upsert never lists placed_out / completed_at, so existing values survive an edit
    const { data, error } = await this.db
      .from("learner_profiles")
      .upsert(
        {
          user_id: userId,
          experience: p.experience,
          goals: p.goals,
          tools: p.tools,
          intent: p.intent,
          pace: p.pace,
          project_types: p.projectTypes,
          platforms: p.platforms,
          reminders_enabled: p.reminders.enabled,
          reminder_hour: p.reminders.hour,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    fail("save profile", error);
    return toStored(data);
  }
  async addPlacedOut(userId: string, skillId: string, now: Date) {
    const cur = await this.get(userId);
    if (!cur) throw new Error("add placement: no profile");
    if (cur.placedOut.includes(skillId)) return;
    const { error } = await this.db
      .from("learner_profiles")
      .update({ placed_out: [...cur.placedOut, skillId], updated_at: now.toISOString() })
      .eq("user_id", userId);
    fail("add placement", error);
  }
}
