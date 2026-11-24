/** Learner profile collected during onboarding. Everything here is self-reported and used only to personalize. */
export const EXPERIENCE_LEVELS = ["new", "some", "experienced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const LEARNING_GOALS = [
  "ship_first_app",
  "understand_ai_code",
  "fix_broken_app",
  "level_up_skills",
  "prepare_for_launch",
] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

/** Tools the learner uses. Used for example relevance only; there are no integrations with these tools. */
export const AI_TOOLS = [
  "claude_code",
  "cursor",
  "lovable",
  "replit",
  "copilot",
  "chat_assistant",
  "none_yet",
] as const;
export type AiTool = (typeof AI_TOOLS)[number];

export const INTENTS = ["start", "continue", "rescue", "learn_first"] as const;
export type Intent = (typeof INTENTS)[number];

export const PACES = ["light", "steady", "intense"] as const;
export type Pace = (typeof PACES)[number];

export const PROJECT_TYPES = ["website", "mobile_app", "web_app", "backend_api", "ai_app"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PLATFORMS = ["web", "ios", "android"] as const;
export type TargetPlatform = (typeof PLATFORMS)[number];

export interface LearnerProfile {
  experience: ExperienceLevel;
  goals: LearningGoal[];
  tools: AiTool[];
  intent: Intent;
  pace: Pace;
  projectTypes: ProjectType[];
  platforms: TargetPlatform[];
  reminders: { enabled: boolean; hour: number };
}

/** Daily XP goal per pace. Meeting it is celebrated; missing it has no penalty. */
export const DAILY_GOAL_XP: Record<Pace, number> = { light: 20, steady: 40, intense: 80 };

export interface ProfileInputIssue {
  field: string;
  message: string;
}

const uniq = <T>(a: readonly T[]) => [...new Set(a)];
const pickAll = <T extends string>(v: unknown, allowed: readonly T[], max: number): T[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => allowed.includes(x as T))
    ? uniq(v as T[])
    : null;

/** Pure validation with explicit limits (kept dependency-free so every platform shares it). */
export function parseProfile(
  input: unknown,
): { ok: true; profile: LearnerProfile } | { ok: false; issues: ProfileInputIssue[] } {
  const issues: ProfileInputIssue[] = [];
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const one = <T extends string>(field: string, allowed: readonly T[]): T => {
    const v = o[field];
    if (typeof v === "string" && allowed.includes(v as T)) return v as T;
    issues.push({ field, message: `Choose one of: ${allowed.join(", ")}` });
    return allowed[0]!;
  };
  const many = <T extends string>(field: string, allowed: readonly T[], min: number): T[] => {
    const v = pickAll(o[field] ?? [], allowed, allowed.length);
    if (!v || v.length < min) {
      issues.push({
        field,
        message: min ? `Pick at least ${min}` : `Invalid selection for ${field}`,
      });
      return [];
    }
    return v;
  };
  const experience = one("experience", EXPERIENCE_LEVELS);
  const intent = one("intent", INTENTS);
  const pace = one("pace", PACES);
  const goals = many("goals", LEARNING_GOALS, 1);
  const tools = many("tools", AI_TOOLS, 1);
  const projectTypes = many("projectTypes", PROJECT_TYPES, 0);
  const platforms = many("platforms", PLATFORMS, 0);
  const r = (o.reminders ?? { enabled: false, hour: 18 }) as Record<string, unknown>;
  const hour = typeof r.hour === "number" && Number.isInteger(r.hour) ? r.hour : NaN;
  if (typeof r.enabled !== "boolean" || !(hour >= 0 && hour <= 23))
    issues.push({
      field: "reminders",
      message: "Reminders need enabled (true/false) and an hour 0-23",
    });
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    profile: {
      experience,
      goals,
      tools,
      intent,
      pace,
      projectTypes,
      platforms,
      reminders: { enabled: r.enabled as boolean, hour },
    },
  };
}

/** Skills worth starting with, by goal. Ids are validated against the curriculum by a server test. */
export const GOAL_FOCUS_SKILLS: Record<LearningGoal, string[]> = {
  ship_first_app: ["ai-builders", "specs", "prompting", "shipping"],
  understand_ai_code: ["app-anatomy", "reading-errors", "ai-collaboration"],
  fix_broken_app: ["reading-errors", "debugging", "testing-verification"],
  level_up_skills: ["backend", "databases", "auth", "security"],
  prepare_for_launch: ["security", "testing-verification", "cicd", "shipping"],
};

/** Skills worth placing out of for people who say they are experienced; they must still pass a check. */
export const PLACEMENT_CANDIDATES = ["app-anatomy", "git-basics", "frontend", "backend"] as const;
