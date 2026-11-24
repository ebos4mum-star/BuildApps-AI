import { describe, expect, it } from "vitest";
import {
  ISOLATION_CONTROLS,
  PROBED_CONTROLS,
  PROBES,
  assertNoForbiddenFlags,
  buildContainerArgv,
  clampLimits,
  MAX_LIMITS,
  runIsolationProbes,
  runtimeAvailability,
  sandboxCheck,
  type IsolationControl,
  type SandboxBackend,
} from "./index";

const NOW = new Date("2026-11-24T12:00:00Z");
const job = { kind: "test" as const, commitSha: "a".repeat(40), sourceSnapshot: "snap-1" };
const opts = { image: "buildapps/runner:1.0", sourceDir: "/srv/snap-1", name: "job-1" };

/** A fake backend whose behavior per control is configurable: `leaks` lists controls it fails to enforce. */
function fakeBackend(leaks: IsolationControl[] = [], throws = false): SandboxBackend {
  return {
    name: "fake",
    async run(_spec, input) {
      if (throws) throw new Error("backend down");
      if (input.type !== "probe")
        return { exitCode: 0, timedOut: false, oomKilled: false, output: "", durationMs: 1 };
      const probe = PROBES.find((p) => p.script === input.script)!;
      const leaked = leaks.includes(probe.control);
      if (probe.blockedMarker === "OOM_KILLED")
        return {
          exitCode: 137,
          timedOut: false,
          oomKilled: !leaked,
          output: leaked ? "BREACH" : "",
          durationMs: 1,
        };
      if (probe.blockedMarker === "TIMED_OUT")
        return {
          exitCode: null,
          timedOut: !leaked,
          oomKilled: false,
          output: leaked ? "BREACH" : "",
          durationMs: 1,
        };
      return {
        exitCode: 0,
        timedOut: false,
        oomKilled: false,
        output: leaked ? probe.breachMarker : probe.blockedMarker,
        durationMs: 1,
      };
    },
  };
}

describe("container spec", () => {
  it("applies every isolation flag and no forbidden ones", () => {
    const { argv, limits } = buildContainerArgv(job, opts);
    const s = argv.join(" ");
    for (const f of [
      "--network none",
      "--read-only",
      "--cap-drop ALL",
      "no-new-privileges",
      "--user 65534:65534",
      "--pids-limit 256",
      "--memory 1024m",
      "--memory-swap 1024m",
      "readonly",
    ])
      expect(s).toContain(f);
    expect(limits.wallClockSeconds).toBe(300);
    expect(() => assertNoForbiddenFlags(argv)).not.toThrow();
  });
  it("only runs fixed commands for a job kind (no user-supplied shell)", () => {
    expect(buildContainerArgv({ ...job, kind: "install" }, opts).argv.join(" ")).toContain(
      "--ignore-scripts",
    );
    expect(buildContainerArgv(job, opts).argv.at(-1)).toBe("test");
  });
  it("clamps resource requests to hard ceilings and ignores junk", () => {
    const l = clampLimits({ memoryMb: 99999, cpus: -1, pids: Number.NaN, wallClockSeconds: 10 });
    expect(l.memoryMb).toBe(MAX_LIMITS.memoryMb);
    expect(l.cpus).toBe(1);
    expect(l.pids).toBe(256);
    expect(l.wallClockSeconds).toBe(10);
  });
  it("rejects injection through names, images, shas and paths", () => {
    expect(() => buildContainerArgv(job, { ...opts, name: "x; rm -rf /" })).toThrow();
    expect(() => buildContainerArgv(job, { ...opts, image: "evil --privileged" })).toThrow();
    expect(() => buildContainerArgv({ ...job, commitSha: "HEAD; id" }, opts)).toThrow();
    expect(() => buildContainerArgv(job, { ...opts, sourceDir: "/srv/a,target=/etc" })).toThrow();
    expect(() => buildContainerArgv(job, { ...opts, sourceDir: "relative" })).toThrow();
  });
  it("detects forbidden flags", () => {
    for (const bad of [
      "--privileged",
      "--network=host",
      "-e",
      "--volume",
      "/var/run/docker.sock:/x",
    ])
      expect(() => assertNoForbiddenFlags(["docker", "run", bad])).toThrow();
  });
});

describe("isolation probes and gate", () => {
  it("every control has a probe", () => {
    expect([...PROBED_CONTROLS].sort()).toEqual([...ISOLATION_CONTROLS].sort());
  });
  it("a fully isolating backend is attested and unlocks the gate", async () => {
    const a = await runIsolationProbes(fakeBackend(), NOW);
    expect(a.failed).toEqual([]);
    expect(runtimeAvailability("fake", a, NOW).available).toBe(true);
  });
  it.each(ISOLATION_CONTROLS)("a backend leaking %s keeps runtime unavailable", async (control) => {
    const a = await runIsolationProbes(fakeBackend([control]), NOW);
    expect(a.failed).toContain(control);
    const r = runtimeAvailability("fake", a, NOW);
    expect(r.available).toBe(false);
  });
  it("a backend that errors proves nothing", async () => {
    const a = await runIsolationProbes(fakeBackend([], true), NOW);
    expect(a.proven).toEqual([]);
    expect(runtimeAvailability("fake", a, NOW).available).toBe(false);
  });
  it("fails closed: no backend, no attestation, wrong backend, expired", async () => {
    const a = await runIsolationProbes(fakeBackend(), NOW);
    expect(runtimeAvailability(null, a, NOW)).toMatchObject({
      available: false,
      code: "no_backend",
    });
    expect(runtimeAvailability("fake", null, NOW)).toMatchObject({
      available: false,
      code: "not_attested",
    });
    expect(runtimeAvailability("other", a, NOW)).toMatchObject({
      available: false,
      code: "not_attested",
    });
    const later = new Date(NOW.getTime() + 25 * 3600_000);
    expect(runtimeAvailability("fake", a, later)).toMatchObject({
      available: false,
      code: "expired",
    });
  });
  it("a forged attestation with failures or missing controls is refused", () => {
    const forged = {
      backend: "fake",
      proven: ISOLATION_CONTROLS.slice(1) as IsolationControl[],
      failed: [],
      checkedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 1e6).toISOString(),
    };
    expect(runtimeAvailability("fake", forged, NOW)).toMatchObject({
      available: false,
      code: "incomplete",
    });
  });
});

describe("verification evidence", () => {
  it("is always unavailable without a verified gate, even if a run is supplied", () => {
    const gate = runtimeAvailability(null, null, NOW);
    const run = { exitCode: 0, timedOut: false, oomKilled: false, output: "ok", durationMs: 5 };
    expect(sandboxCheck("test", gate, run, "abc").status).toBe("unavailable");
  });
  it("reports pass/fail with evidence only through a verified gate", async () => {
    const gate = runtimeAvailability("fake", await runIsolationProbes(fakeBackend(), NOW), NOW);
    const ok = {
      exitCode: 0,
      timedOut: false,
      oomKilled: false,
      output: "42 passed",
      durationMs: 5,
    };
    expect(sandboxCheck("test", gate, ok, "abc")).toMatchObject({
      status: "pass",
      evidence: { commitSha: "abc", backend: "fake" },
    });
    expect(sandboxCheck("test", gate, { ...ok, exitCode: 1 }, "abc").status).toBe("fail");
    expect(sandboxCheck("test", gate, { ...ok, timedOut: true }, "abc").status).toBe("fail");
    expect(sandboxCheck("test", gate, null, "abc").status).toBe("unavailable");
  });
});
