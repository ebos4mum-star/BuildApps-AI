import { parseProfile, type LearnerProfile } from "@buildapps/core";
import {
  curriculum,
  findExercise,
  gradeExercise,
  isExerciseUnlocked,
  placementExerciseIds,
  toClientExercise,
  type ClientExercise,
} from "@buildapps/lessons";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type { StoredProfile } from "./store";

export async function getMyProfile(d: Deps, userId: string): Promise<StoredProfile | null> {
  return d.stores.profiles.get(userId);
}

export async function saveMyProfile(d: Deps, userId: string, input: unknown) {
  const r = parseProfile(input);
  if (!r.ok)
    throw new WorkspaceError("invalid", r.issues.map((i) => `${i.field}: ${i.message}`).join("; "));
  return d.stores.profiles.save(userId, r.profile as LearnerProfile, nowOf(d));
}

export interface PlacementCheck {
  skillId: string;
  skillName: string;
  exercises: ClientExercise[];
}

async function placementContext(d: Deps, userId: string, skillId: string) {
  const skill = curriculum.skills.find((k) => k.id === skillId);
  if (!skill) throw new WorkspaceError("not_found", "Unknown skill");
  const stored = await d.stores.profiles.get(userId);
  if (!stored)
    throw new WorkspaceError("conflict", "Complete onboarding before taking a skill check");
  const ids = placementExerciseIds(skillId);
  if (ids.length === 0) throw new WorkspaceError("not_found", "No skill check for this skill");
  const state = await d.stores.progress.load(userId, "");
  if (!isExerciseUnlocked(ids[0]!, state.passedExerciseIds, state.placedOut))
    throw new WorkspaceError("forbidden", "Finish the earlier skills before checking this one");
  if (state.placedOut.has(skillId))
    throw new WorkspaceError("conflict", "You already passed this skill check");
  return { skill, ids };
}

/** Questions for a skill check: solution-stripped, exactly like lessons. */
export async function getPlacement(
  d: Deps,
  userId: string,
  skillId: string,
): Promise<PlacementCheck> {
  const { skill, ids } = await placementContext(d, userId, skillId);
  return {
    skillId,
    skillName: skill.name,
    exercises: ids.map((id) => toClientExercise(findExercise(id)!.exercise)),
  };
}

/**
 * Server-graded. Passing records that the learner may skip this skill's lessons; it grants NO XP, level,
 * achievement or streak activity, because knowing something once is not the same as demonstrated mastery.
 * Failing reveals only which questions were missed, never solutions or explanations.
 */
export async function submitPlacement(d: Deps, userId: string, skillId: string, input: unknown) {
  const { ids } = await placementContext(d, userId, skillId);
  const answers = (
    input && typeof input === "object" ? (input as { answers?: unknown }).answers : null
  ) as Record<string, unknown> | null;
  if (!answers || typeof answers !== "object")
    throw new WorkspaceError("invalid", "Provide an answer for every question");
  const results = ids.map((id) => {
    let correct = false;
    try {
      if (id in answers) correct = gradeExercise(findExercise(id)!.exercise, answers[id]).correct;
    } catch {
      correct = false; // malformed answers are simply wrong
    }
    return { exerciseId: id, correct };
  });
  const passed = results.every((r) => r.correct);
  if (passed) await d.stores.profiles.addPlacedOut(userId, skillId, nowOf(d));
  return { passed, results };
}
