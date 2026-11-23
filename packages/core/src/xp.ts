import { z } from "zod";
import { toDayKey } from "./dates";

/**
 * XP awards are pure computations over a request plus server-supplied context. Persistence must
 * enforce UNIQUE (user_id, award_key) so that concurrent/replayed requests stay idempotent.
 * Clients never call this directly: the server decides `passed`, `completionSource`, etc.
 */
export const XP_SOURCES = [
  "exercise",
  "skill_demonstration",
  "project_milestone",
  "reward",
] as const;
export type XpSource = (typeof XP_SOURCES)[number];

export const EXERCISE_XP = { 1: 10, 2: 20, 3: 35 } as const;
export const FIRST_TRY_BONUS_RATIO = 0.25;
export const DAILY_EXERCISE_XP_CAP = 300;
export const SKILL_LEVEL_XP = { beginner: 50, intermediate: 100, advanced: 200 } as const;
export const MAX_MILESTONE_XP = 500;
export const MAX_REWARD_XP = 1000;
export const DEFAULT_MILESTONE_XP = 100;

const id = z.string().min(1).max(128);
const instant = z.union([z.string(), z.date()]).transform((v, ctx) => {
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "invalid date" });
    return z.NEVER;
  }
  return d;
});

const base = { userId: id, occurredAt: instant };

export const awardRequestSchema = z.discriminatedUnion("source", [
  z.object({
    ...base,
    source: z.literal("exercise"),
    exerciseId: id,
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    passed: z.boolean(),
    attemptNumber: z.number().int().min(1),
  }),
  z.object({
    ...base,
    source: z.literal("skill_demonstration"),
    skillId: id,
    level: z.enum(["beginner", "intermediate", "advanced"]),
  }),
  z.object({
    ...base,
    source: z.literal("project_milestone"),
    projectId: id,
    milestoneId: id,
    completionSource: z.enum(["user_reported", "verified"]),
    xpValue: z.number().int().min(0).max(MAX_MILESTONE_XP).default(DEFAULT_MILESTONE_XP),
  }),
  z.object({
    ...base,
    source: z.literal("reward"),
    rewardId: id,
    xp: z.number().int().min(0).max(MAX_REWARD_XP),
  }),
]);
export type AwardRequest = z.input<typeof awardRequestSchema>;

export interface XpAward {
  userId: string;
  source: XpSource;
  awardKey: string;
  xp: number;
  occurredAt: Date;
}

export interface AwardContext {
  /** award_key values already persisted for this user. */
  existingAwardKeys: ReadonlySet<string>;
  /** Exercise XP already earned on the request's learning day. */
  exerciseXpEarnedToday: number;
  /** IANA timezone used to define "today" for the daily cap (informational for callers). */
  timeZone: string;
}

export type AwardResult =
  | { status: "awarded"; award: XpAward }
  | { status: "duplicate"; awardKey: string }
  | { status: "no_award"; reason: "not_passed" | "not_verified" | "daily_cap_reached" | "zero_xp" };

export function buildAwardKey(req: z.output<typeof awardRequestSchema>): string {
  switch (req.source) {
    case "exercise":
      return `exercise:${req.exerciseId}`;
    case "skill_demonstration":
      return `skill:${req.skillId}:${req.level}`;
    case "project_milestone":
      return `milestone:${req.projectId}:${req.milestoneId}`;
    case "reward":
      return `reward:${req.rewardId}`;
  }
}

/** Throws ZodError on invalid input. Deterministic: same inputs => same result. */
export function computeAward(input: AwardRequest, ctx: AwardContext): AwardResult {
  const req = awardRequestSchema.parse(input);
  const awardKey = buildAwardKey(req);
  const done = (xp: number): AwardResult =>
    xp <= 0
      ? { status: "no_award", reason: "zero_xp" }
      : {
          status: "awarded",
          award: {
            userId: req.userId,
            source: req.source,
            awardKey,
            xp,
            occurredAt: req.occurredAt,
          },
        };

  if (ctx.existingAwardKeys.has(awardKey)) return { status: "duplicate", awardKey };

  switch (req.source) {
    case "exercise": {
      if (!req.passed) return { status: "no_award", reason: "not_passed" };
      const baseXp = EXERCISE_XP[req.difficulty];
      const bonus = req.attemptNumber === 1 ? Math.floor(baseXp * FIRST_TRY_BONUS_RATIO) : 0;
      const remaining = Math.max(0, DAILY_EXERCISE_XP_CAP - ctx.exerciseXpEarnedToday);
      if (remaining === 0) return { status: "no_award", reason: "daily_cap_reached" };
      return done(Math.min(baseXp + bonus, remaining));
    }
    case "skill_demonstration":
      return done(SKILL_LEVEL_XP[req.level]);
    case "project_milestone":
      // Self-reported completion earns nothing; it can be upgraded later by verification.
      if (req.completionSource !== "verified")
        return { status: "no_award", reason: "not_verified" };
      return done(req.xpValue);
    case "reward":
      return done(req.xp);
  }
}

/** Convenience: which learning day an award counts toward, for the daily cap query. */
export function awardDay(occurredAt: Date | string, tz: string): string {
  return toDayKey(occurredAt, tz);
}

/** Total XP needed to reach `level` (level 1 = 0, 2 = 100, 3 = 300, 4 = 600, ...). */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be an integer >= 1");
  return 50 * level * (level - 1);
}

export function levelFromXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp < 0) throw new RangeError("totalXp must be >= 0");
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

export function sumXp(awards: readonly Pick<XpAward, "xp">[]): number {
  return awards.reduce((s, a) => s + a.xp, 0);
}
