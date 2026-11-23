import {
  advanceRecovery,
  completeMilestone,
  createProject,
  InvalidTransitionError,
  requestHumanHelp,
  transitionProject,
  type Project,
  type ProjectIntake,
  type ProjectState,
} from "@buildapps/core";
import type { ProjectStore } from "./store";

export class ProjectError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden_transition" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

/** States a client may request. `in_verification` and verified completion are server/verification-only. */
export const CLIENT_REQUESTABLE_STATES: readonly ProjectState[] = [
  "active",
  "needs_help",
  "completed",
  "archived",
];

async function load(store: ProjectStore, ownerId: string, id: string): Promise<Project> {
  const p = await store.get(ownerId, id);
  if (!p) throw new ProjectError("not_found", "Project not found");
  return p;
}

export async function createUserProject(
  store: ProjectStore,
  ownerId: string,
  intake: ProjectIntake,
  now = new Date(),
): Promise<Project> {
  let project: Project;
  try {
    project = createProject({ id: crypto.randomUUID(), ownerId, intake }, now);
  } catch (e) {
    throw new ProjectError("invalid", e instanceof Error ? e.message : "Invalid project");
  }
  await store.create(project);
  return project;
}

export async function changeProjectState(
  store: ProjectStore,
  ownerId: string,
  id: string,
  to: ProjectState,
  now = new Date(),
) {
  if (!CLIENT_REQUESTABLE_STATES.includes(to))
    throw new ProjectError("forbidden_transition", `Cannot request state ${to}`);
  const p = await load(store, ownerId, id);
  try {
    const next = transitionProject(p, to, now);
    await store.save(next);
    return next;
  } catch (e) {
    if (e instanceof InvalidTransitionError)
      throw new ProjectError("forbidden_transition", e.message);
    throw e;
  }
}

/** Users can only SELF-REPORT progress. Verified completion is written by the verification service. */
export async function reportMilestone(
  store: ProjectStore,
  ownerId: string,
  id: string,
  milestoneKey: string,
  now = new Date(),
) {
  const p = await load(store, ownerId, id);
  try {
    const next = completeMilestone(p, milestoneKey, "user_reported", now);
    await store.save(next);
    return next;
  } catch (e) {
    throw new ProjectError("invalid", e instanceof Error ? e.message : "Invalid");
  }
}

export async function advanceProjectRecovery(
  store: ProjectStore,
  ownerId: string,
  id: string,
  now = new Date(),
) {
  const p = await load(store, ownerId, id);
  try {
    const next = advanceRecovery(p, now);
    await store.save(next);
    return next;
  } catch (e) {
    throw new ProjectError("invalid", e instanceof Error ? e.message : "Invalid");
  }
}

export async function askForHumanHelp(
  store: ProjectStore,
  ownerId: string,
  id: string,
  summary: string,
  now = new Date(),
) {
  const p = await load(store, ownerId, id);
  const text = summary.trim();
  if (text.length < 10 || text.length > 2000)
    throw new ProjectError("invalid", "Describe what you need help with (10-2000 characters)");
  let next: Project;
  try {
    next = requestHumanHelp(p, now);
  } catch (e) {
    throw new ProjectError("invalid", e instanceof Error ? e.message : "Invalid");
  }
  // Only the first request creates a queue entry; repeats are idempotent.
  if (!p.recovery?.humanHelpRequested) {
    await store.createServiceRequest(ownerId, id, text);
    await store.save(next);
  }
  return next;
}

export const listUserProjects = (store: ProjectStore, ownerId: string) => store.list(ownerId);
export const getUserProject = (store: ProjectStore, ownerId: string, id: string) =>
  load(store, ownerId, id);
