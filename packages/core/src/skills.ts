import { z } from "zod";

export const SKILL_LEVELS = ["none", "beginner", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export interface SkillDefinition {
  id: string;
  name: string;
  prerequisites: readonly { skillId: string; minLevel: Exclude<SkillLevel, "none"> }[];
}

export const evidenceSchema = z.object({
  evidenceId: z.string().min(1),
  skillId: z.string().min(1),
  kind: z.enum(["exercise", "project_verified"]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type SkillEvidence = z.input<typeof evidenceSchema>;

/** Points per evidence. Verified real-project work is worth the most. */
export const EVIDENCE_POINTS = { exercise: { 1: 1, 2: 2, 3: 3 }, project_verified: 6 } as const;

/**
 * Level rules (evidence-based, not just XP):
 * - beginner:     >= 5 points
 * - intermediate: >= 15 points AND >= 2 distinct evidences at difficulty >= 2
 * - advanced:     >= 30 points AND >= 1 verified project evidence
 */
export const LEVEL_THRESHOLDS = { beginner: 5, intermediate: 15, advanced: 30 } as const;

export interface SkillState {
  skillId: string;
  level: SkillLevel;
  points: number;
  unlocked: boolean;
  nextLevel: Exclude<SkillLevel, "none"> | null;
  /** 0..1 progress of points toward the next level's threshold. */
  progressToNext: number;
}

const rank = (l: SkillLevel) => SKILL_LEVELS.indexOf(l);

export function validateSkillGraph(defs: readonly SkillDefinition[]): void {
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) throw new Error(`Duplicate skill id: ${d.id}`);
    ids.add(d.id);
  }
  for (const d of defs)
    for (const p of d.prerequisites)
      if (!ids.has(p.skillId))
        throw new Error(`Skill ${d.id} has unknown prerequisite ${p.skillId}`);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const byId = new Map(defs.map((d) => [d.id, d]));
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Prerequisite cycle involving ${id}`);
    visiting.add(id);
    for (const p of byId.get(id)?.prerequisites ?? []) visit(p.skillId);
    visiting.delete(id);
    done.add(id);
  };
  defs.forEach((d) => visit(d.id));
}

function levelFor(evidence: readonly z.output<typeof evidenceSchema>[]): {
  level: SkillLevel;
  points: number;
} {
  let points = 0;
  let mid = 0;
  let verified = 0;
  for (const e of evidence) {
    points +=
      e.kind === "project_verified"
        ? EVIDENCE_POINTS.project_verified
        : EVIDENCE_POINTS.exercise[e.difficulty];
    if (e.difficulty >= 2) mid++;
    if (e.kind === "project_verified") verified++;
  }
  let level: SkillLevel = "none";
  if (points >= LEVEL_THRESHOLDS.beginner) level = "beginner";
  if (points >= LEVEL_THRESHOLDS.intermediate && mid >= 2) level = "intermediate";
  if (level === "intermediate" && points >= LEVEL_THRESHOLDS.advanced && verified >= 1)
    level = "advanced";
  return { level, points };
}

/** Deterministic: evidence is de-duplicated by evidenceId, so retries/replays add nothing. */
export function computeSkillTree(
  defs: readonly SkillDefinition[],
  rawEvidence: readonly SkillEvidence[],
): Map<string, SkillState> {
  validateSkillGraph(defs);
  const seen = new Set<string>();
  const bySkill = new Map<string, z.output<typeof evidenceSchema>[]>();
  const known = new Set(defs.map((d) => d.id));
  for (const raw of rawEvidence) {
    const e = evidenceSchema.parse(raw);
    if (!known.has(e.skillId) || seen.has(e.evidenceId)) continue;
    seen.add(e.evidenceId);
    (bySkill.get(e.skillId) ?? bySkill.set(e.skillId, []).get(e.skillId)!).push(e);
  }

  const byId = new Map(defs.map((d) => [d.id, d]));
  const out = new Map<string, SkillState>();
  const compute = (id: string): SkillState => {
    const cached = out.get(id);
    if (cached) return cached;
    const def = byId.get(id)!;
    const unlocked = def.prerequisites.every(
      (p) => rank(compute(p.skillId).level) >= rank(p.minLevel),
    );
    const { level, points } = unlocked
      ? levelFor(bySkill.get(id) ?? [])
      : { level: "none" as const, points: 0 };
    const nextLevel =
      level === "advanced" ? null : (SKILL_LEVELS[rank(level) + 1] as Exclude<SkillLevel, "none">);
    const progressToNext = nextLevel ? Math.min(1, points / LEVEL_THRESHOLDS[nextLevel]) : 1;
    const state: SkillState = { skillId: id, level, points, unlocked, nextLevel, progressToNext };
    out.set(id, state);
    return state;
  };
  defs.forEach((d) => compute(d.id));
  return out;
}
