/**
 * Verification Lab isolation contract.
 *
 * Untrusted repository code may only ever run behind a backend that has PROVED its isolation. Until a backend
 * has passed the probe suite recently, runtime verification stays `unavailable`; there is no override.
 */

/** Controls an execution environment must demonstrably provide. Each is checked by a probe, not self-declared. */
export const ISOLATION_CONTROLS = [
  "no-host-filesystem", // cannot read host files or other tenants' data
  "no-network-egress", // cannot reach the internet, cloud metadata or internal ranges
  "no-secrets-in-env", // BuildApps/provider credentials are never present in the environment
  "non-root", // runs unprivileged without capabilities
  "memory-limit", // exceeding the memory cap kills the job
  "pid-limit", // fork bombs are contained
  "wall-clock-limit", // runaway jobs are killed
  "ephemeral-workspace", // nothing survives between runs
  "read-only-root", // the base filesystem cannot be modified
] as const;
export type IsolationControl = (typeof ISOLATION_CONTROLS)[number];

export interface ResourceLimits {
  memoryMb: number;
  cpus: number;
  pids: number;
  wallClockSeconds: number;
  /** Maximum bytes of stdout+stderr retained. */
  outputBytes: number;
  /** Size of the writable scratch space. */
  scratchMb: number;
}
export const DEFAULT_LIMITS: ResourceLimits = {
  memoryMb: 1024,
  cpus: 1,
  pids: 256,
  wallClockSeconds: 300,
  outputBytes: 256 * 1024,
  scratchMb: 512,
};
/** Hard ceilings: callers can lower limits but never raise them past these. */
export const MAX_LIMITS: ResourceLimits = {
  memoryMb: 2048,
  cpus: 2,
  pids: 512,
  wallClockSeconds: 900,
  outputBytes: 1024 * 1024,
  scratchMb: 1024,
};

/** What a job is allowed to do. Commands are chosen from a closed list; users never supply a shell string. */
export const JOB_KINDS = ["install", "build", "test"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface SandboxJob {
  kind: JobKind;
  /** Pinned commit; the sandbox runs exactly this tree. */
  commitSha: string;
  /** Opaque reference to a read-only snapshot of the source, produced by the (read-only) GitHub fetcher. */
  sourceSnapshot: string;
  limits?: Partial<ResourceLimits>;
}

export interface SandboxRunOutput {
  exitCode: number | null;
  timedOut: boolean;
  oomKilled: boolean;
  /** Truncated combined output. */
  output: string;
  durationMs: number;
}

/** A backend executes a prepared, hardened specification. It must never be handed a raw shell command from a user. */
export interface SandboxBackend {
  readonly name: string;
  run(
    spec: { argv: string[]; limits: ResourceLimits },
    input: ProbeOrJob,
  ): Promise<SandboxRunOutput>;
}
export type ProbeOrJob = { type: "job"; job: SandboxJob } | { type: "probe"; script: string };

export interface IsolationAttestation {
  backend: string;
  /** Controls proven by passing probes. */
  proven: IsolationControl[];
  failed: IsolationControl[];
  checkedAt: string;
  /** Attestations expire so isolation is re-proved regularly. */
  expiresAt: string;
}

export const ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000;

/** The fixed commands for each job kind. Network is off for all of them; dependencies come from a vetted snapshot. */
export const JOB_COMMANDS: Record<JobKind, string[]> = {
  install: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
  build: ["pnpm", "run", "build"],
  test: ["pnpm", "test"],
};

export function clampLimits(requested: Partial<ResourceLimits> | undefined): ResourceLimits {
  const out = { ...DEFAULT_LIMITS };
  for (const k of Object.keys(DEFAULT_LIMITS) as (keyof ResourceLimits)[]) {
    const v = requested?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.min(v, MAX_LIMITS[k]);
  }
  return out;
}
