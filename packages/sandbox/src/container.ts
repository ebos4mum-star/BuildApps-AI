import { clampLimits, JOB_COMMANDS, type ResourceLimits, type SandboxJob } from "./contract";

/**
 * Builds the argv for a hardened OCI container (docker/podman compatible). Pure and unit-tested so every
 * isolation flag is asserted. Using a container is the baseline; production should additionally use a
 * microVM or gVisor runtime (set `runtime`) because plain containers share the host kernel.
 */
export interface ContainerSpecOptions {
  engine?: "docker" | "podman";
  image: string;
  /** e.g. "runsc" (gVisor) or "kata". Strongly recommended for untrusted code. */
  runtime?: string;
  /** Host path of the read-only source snapshot. */
  sourceDir: string;
  name: string;
}

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const SAFE_IMAGE = /^[a-z0-9][a-z0-9./_-]*(:[a-zA-Z0-9._-]+)?(@sha256:[0-9a-f]{64})?$/;

export function buildContainerArgv(
  job: SandboxJob,
  opts: ContainerSpecOptions,
): { argv: string[]; limits: ResourceLimits } {
  if (!SAFE_NAME.test(opts.name)) throw new Error("unsafe container name");
  if (!SAFE_IMAGE.test(opts.image)) throw new Error("unsafe image reference");
  if (!/^[0-9a-f]{7,64}$/.test(job.commitSha)) throw new Error("commitSha must be a hex git sha");
  if (/[\0,:]/.test(opts.sourceDir) || !opts.sourceDir.startsWith("/"))
    throw new Error("sourceDir must be an absolute path without ':' or ','");
  const limits = clampLimits(job.limits);
  const argv = [
    opts.engine ?? "docker",
    "run",
    "--rm",
    "--name",
    opts.name,
    ...(opts.runtime ? ["--runtime", opts.runtime] : []),
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "--pids-limit",
    String(limits.pids),
    "--memory",
    `${limits.memoryMb}m`,
    "--memory-swap",
    `${limits.memoryMb}m`,
    "--cpus",
    String(limits.cpus),
    "--ulimit",
    "nofile=1024:1024",
    "--tmpfs",
    `/scratch:rw,noexec,nosuid,size=${limits.scratchMb}m`,
    "--mount",
    `type=bind,source=${opts.sourceDir},target=/src,readonly`,
    "--workdir",
    "/src",
    // No --env, --env-file, --volume of the host root, --privileged, --device or docker socket, ever.
    opts.image,
    ...JOB_COMMANDS[job.kind],
  ];
  return { argv, limits };
}

/** Flags that must never appear in a sandbox invocation (asserted in tests and by the gate). */
export const FORBIDDEN_FLAGS = [
  "--privileged",
  "--network=host",
  "--net=host",
  "--pid=host",
  "--ipc=host",
  "--env",
  "-e",
  "--env-file",
  "--device",
  "--cap-add",
  "-v",
  "--volume",
  "--security-opt=seccomp=unconfined",
];
export function assertNoForbiddenFlags(argv: readonly string[]): void {
  for (const a of argv) {
    const flag = a.split("=")[0]!;
    if (FORBIDDEN_FLAGS.includes(a) || FORBIDDEN_FLAGS.includes(flag))
      throw new Error(`forbidden sandbox flag: ${a}`);
    if (a.includes("docker.sock"))
      throw new Error("the container engine socket must never be mounted");
  }
}
