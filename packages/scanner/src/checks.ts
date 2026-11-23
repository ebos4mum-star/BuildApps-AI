import { isTestFile } from "./files";
import type { Finding, ProjectProfile, RepoSnapshot } from "./types";

/** One piece of verification evidence. Only deterministic observations - never an AI opinion. */
export interface VerificationCheck {
  id: string;
  title: string;
  status: "pass" | "fail" | "skipped" | "unavailable";
  source: "static" | "ci_checks" | "sandbox";
  /** Plain data a human can audit (paths, counts, check-run names). */
  evidence: Record<string, unknown>;
}

/** Safe static checks over a snapshot. Nothing from the repository is executed. */
export function runStaticChecks(
  snap: RepoSnapshot,
  profile: ProjectProfile,
  findings: readonly Finding[],
): VerificationCheck[] {
  const paths = snap.tree.map((t) => t.path);
  const testFiles = paths.filter(isTestFile);
  const realTestScript = !!profile.scripts.test && !/no test specified/i.test(profile.scripts.test);
  const has = (id: string) => findings.some((f) => f.ruleId === id);
  const check = (
    id: string,
    title: string,
    pass: boolean,
    evidence: Record<string, unknown>,
  ): VerificationCheck => ({
    id,
    title,
    status: pass ? "pass" : "fail",
    source: "static",
    evidence,
  });
  const checks: VerificationCheck[] = [
    check(
      "static.tests-present",
      "Test files exist and a test script is defined",
      testFiles.length > 0 && realTestScript,
      { testFiles: testFiles.length, testScript: realTestScript },
    ),
    check(
      "static.build-script",
      "A build script is defined",
      !!profile.scripts.build ||
        !profile.frameworks.some((f) =>
          ["Next.js", "Vite", "Astro", "Gatsby", "Nuxt", "SvelteKit", "Angular", "Remix"].includes(
            f,
          ),
        ),
      { build: profile.scripts.build ?? null },
    ),
    check(
      "static.lockfile",
      "Dependencies are locked",
      !has("no-lockfile") && !has("missing-package-json"),
      { packageManager: profile.packageManager },
    ),
    check(
      "static.no-committed-env",
      "No environment or credential files are committed",
      !has("env-file-committed") && !has("credential-file-committed"),
      {},
    ),
    check(
      "static.no-secret-patterns",
      "No credential patterns detected in sampled source",
      !has("hardcoded-secret"),
      {
        filesSampled: profile.stats.contentFilesScanned,
        note: "heuristic: absence of matches is not proof",
      },
    ),
  ];
  // Real test execution requires an isolated sandbox that does not exist yet. Say so explicitly.
  checks.push({
    id: "sandbox.tests",
    title: "Tests executed in an isolated sandbox",
    status: "unavailable",
    source: "sandbox",
    evidence: {
      reason:
        "Isolated execution is not enabled; no repository code is ever run on BuildApps servers.",
    },
  });
  return checks;
}

export interface CheckRunInfo {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
}

/**
 * Turns the repository's OWN CI results (GitHub check runs for the head commit) into evidence.
 * We only read results; the user's CI did the executing in GitHub's infrastructure.
 */
export function evaluateCiChecks(
  runs: readonly CheckRunInfo[] | null,
  commitSha?: string,
): VerificationCheck {
  const base = {
    id: "ci.green",
    title: "Repository CI passes on the latest commit",
    source: "ci_checks" as const,
  };
  if (runs === null)
    return {
      ...base,
      status: "unavailable",
      evidence: {
        reason: "CI results could not be read (permission not granted or API error)",
        commitSha,
      },
    };
  if (runs.length === 0)
    return {
      ...base,
      status: "unavailable",
      evidence: { reason: "No CI check runs exist for this commit", commitSha },
    };
  const pending = runs.filter((r) => r.status !== "completed");
  const bad = runs.filter(
    (r) =>
      r.status === "completed" && !["success", "neutral", "skipped"].includes(r.conclusion ?? ""),
  );
  const summary = {
    commitSha,
    total: runs.length,
    failing: bad.map((r) => r.name),
    pending: pending.map((r) => r.name),
    passing: runs.filter(
      (r) =>
        r.status === "completed" && ["success", "neutral", "skipped"].includes(r.conclusion ?? ""),
    ).length,
  };
  if (bad.length > 0) return { ...base, status: "fail", evidence: summary };
  if (pending.length > 0)
    return { ...base, status: "skipped", evidence: { ...summary, reason: "CI is still running" } };
  return { ...base, status: "pass", evidence: summary };
}
