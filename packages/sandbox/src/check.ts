import type { RuntimeAvailability } from "./gate";
import type { JobKind, SandboxRunOutput } from "./contract";

/** Shape-compatible with the scanner's VerificationCheck (kept local so the sandbox has no dependencies). */
export interface SandboxCheck {
  id: string;
  title: string;
  status: "pass" | "fail" | "unavailable";
  source: "sandbox";
  evidence: Record<string, unknown>;
}

export const SANDBOX_CHECK_TITLES: Record<JobKind, string> = {
  install: "Dependencies install in an isolated sandbox",
  build: "Build succeeds in an isolated sandbox",
  test: "Tests pass in an isolated sandbox",
};

/** Turns a run (or its absence) into evidence. Without a verified gate it is always `unavailable`. */
export function sandboxCheck(
  kind: JobKind,
  availability: RuntimeAvailability,
  run: SandboxRunOutput | null,
  commitSha: string,
): SandboxCheck {
  const base = {
    id: `sandbox.${kind}`,
    title: SANDBOX_CHECK_TITLES[kind],
    source: "sandbox" as const,
  };
  if (!availability.available || !run)
    return {
      ...base,
      status: "unavailable",
      evidence: {
        reason: availability.available ? "No run recorded for this commit." : availability.reason,
        commitSha,
      },
    };
  const pass = run.exitCode === 0 && !run.timedOut && !run.oomKilled;
  return {
    ...base,
    status: pass ? "pass" : "fail",
    evidence: {
      commitSha,
      backend: availability.backend,
      attestedAt: availability.verifiedAt,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      oomKilled: run.oomKilled,
      durationMs: run.durationMs,
      outputTail: run.output.slice(-4000),
    },
  };
}
