import {
  ATTESTATION_TTL_MS,
  DEFAULT_LIMITS,
  ISOLATION_CONTROLS,
  type IsolationAttestation,
  type IsolationControl,
  type SandboxBackend,
} from "./contract";
import { assertNoForbiddenFlags } from "./container";

/**
 * Probes are hostile scripts run INSIDE the sandbox. A control is "proven" only when the hostile behavior is
 * observed to be blocked. Scripts print one marker; the verdict is decided here, never by the backend.
 */
export interface Probe {
  control: IsolationControl;
  script: string;
  /** Output marker that means the attack was BLOCKED. */
  blockedMarker: string;
  /** Output marker that means the attack SUCCEEDED (fails the control). */
  breachMarker: string;
}

const sh = (body: string) => body;
export const PROBES: Probe[] = [
  {
    control: "no-host-filesystem",
    script: sh(
      "test -r /etc/shadow -o -d /host -o -d /var/run/docker.sock && echo BREACH || echo BLOCKED",
    ),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "no-network-egress",
    script: sh(
      "(timeout 3 sh -c 'echo > /dev/tcp/169.254.169.254/80' || timeout 3 sh -c 'echo > /dev/tcp/1.1.1.1/53') 2>/dev/null && echo BREACH || echo BLOCKED",
    ),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "no-secrets-in-env",
    script: sh(
      "env | grep -Ei 'SERVICE_ROLE|SECRET|TOKEN|API_KEY|PASSWORD|DATABASE_URL' >/dev/null && echo BREACH || echo BLOCKED",
    ),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "non-root",
    script: sh('[ "$(id -u)" = 0 ] && echo BREACH || echo BLOCKED'),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "memory-limit",
    script: sh("x=$(head -c 2147483648 /dev/zero | tr '\\0' a); echo BREACH"),
    blockedMarker: "OOM_KILLED", // decided from the run result (oomKilled), see below
    breachMarker: "BREACH",
  },
  {
    control: "pid-limit",
    script: sh(
      "(i=0; while [ $i -lt 5000 ]; do sleep 30 & i=$((i+1)); done; echo BREACH) 2>/dev/null || echo BLOCKED",
    ),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "wall-clock-limit",
    script: sh("sleep 100000; echo BREACH"),
    blockedMarker: "TIMED_OUT",
    breachMarker: "BREACH",
  },
  {
    control: "ephemeral-workspace",
    script: sh(
      "[ -e /scratch/previous-run-marker ] && echo BREACH || { touch /scratch/previous-run-marker; echo BLOCKED; }",
    ),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
  {
    control: "read-only-root",
    script: sh("touch /usr/probe-write 2>/dev/null && echo BREACH || echo BLOCKED"),
    blockedMarker: "BLOCKED",
    breachMarker: "BREACH",
  },
];

/** The probe suite must cover every control; asserted in tests so a new control cannot ship unprobed. */
export const PROBED_CONTROLS = new Set(PROBES.map((p) => p.control));

export async function runIsolationProbes(
  backend: SandboxBackend,
  now: Date,
  ttlMs = ATTESTATION_TTL_MS,
): Promise<IsolationAttestation> {
  const proven: IsolationControl[] = [];
  const failed: IsolationControl[] = [];
  for (const probe of PROBES) {
    let ok = false;
    try {
      const r = await backend.run(
        {
          argv: ["probe"],
          limits: { ...DEFAULT_LIMITS, wallClockSeconds: 10, memoryMb: 256, pids: 64 },
        },
        { type: "probe", script: probe.script },
      );
      if (probe.blockedMarker === "OOM_KILLED")
        ok = r.oomKilled && !r.output.includes(probe.breachMarker);
      else if (probe.blockedMarker === "TIMED_OUT")
        ok = r.timedOut && !r.output.includes(probe.breachMarker);
      else ok = r.output.includes(probe.blockedMarker) && !r.output.includes(probe.breachMarker);
    } catch {
      ok = false; // a backend that errors proves nothing
    }
    (ok ? proven : failed).push(probe.control);
  }
  return {
    backend: backend.name,
    proven,
    failed: ISOLATION_CONTROLS.filter((c) => !proven.includes(c)),
    checkedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export { assertNoForbiddenFlags };
