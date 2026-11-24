import { buildLearningPath, getLesson } from "@buildapps/lessons";
import type { FindingRow } from "./batch2-types";

/** Which lessons help with which kind of scanner finding. Ids are validated by tests. */
export const CATEGORY_LESSONS: Record<string, string[]> = {
  security: ["sec-1", "auth-1", "db-2"],
  structure: ["anatomy-1", "git-1"],
  docs: ["specs-1", "prompt-1"],
  build: ["errors-1", "debug-1"],
  completeness: ["specs-1", "front-2"],
  dependencies: ["maint-1", "api-1"],
  tests: ["test-1", "debug-1"],
};

export interface LessonRecommendation {
  lessonId: string;
  title: string;
  reason: string;
  status: "available" | "in_progress" | "locked";
}

/**
 * Project-linked learning: open findings point at lessons that teach the underlying skill. Lessons the
 * learner already finished are skipped, and locked lessons are returned as such (never bypassed).
 */
export function recommendForFindings(
  findings: Pick<FindingRow, "category" | "title" | "status" | "severity">[],
  passedExerciseIds: Iterable<string>,
  limit = 4,
): LessonRecommendation[] {
  const path = buildLearningPath(passedExerciseIds);
  const status = new Map(path.units.flatMap((u) => u.lessons).map((l) => [l.id, l.status]));
  const sevRank = ["critical", "high", "medium", "low", "info"];
  const open = findings
    .filter((f) => f.status === "open" || f.status === "in_progress")
    .sort((a, b) => sevRank.indexOf(a.severity) - sevRank.indexOf(b.severity));
  const out: LessonRecommendation[] = [];
  const seen = new Set<string>();
  for (const f of open)
    for (const id of CATEGORY_LESSONS[f.category] ?? []) {
      const st = status.get(id);
      const lesson = getLesson(id);
      if (!lesson || !st || st === "complete" || seen.has(id)) continue;
      seen.add(id);
      out.push({
        lessonId: id,
        title: lesson.title,
        reason: `Your scan found: ${f.title}`,
        status: st,
      });
    }
  return out.slice(0, limit);
}
