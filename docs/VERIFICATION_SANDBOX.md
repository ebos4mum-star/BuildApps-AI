# Verification Lab: isolated execution design

**Status: designed and tested; execution stays UNAVAILABLE.** No repository code runs on BuildApps servers. No
execution backend is wired in `Deps`, so `runtimeAvailability()` returns `no_backend`.

## Layers (`packages/sandbox`)

1. **Contract** (`contract.ts`): nine isolation controls, resource limits with hard ceilings, and a closed list of job
   kinds (`install`, `build`, `test`) mapped to fixed commands. Users never supply a shell string.
2. **Hardened spec** (`container.ts`): builds the OCI argv: `--network none`, read-only root, all capabilities dropped,
   `no-new-privileges`, uid 65534, pid/memory/CPU limits, a `noexec` tmpfs scratch, source mounted read-only, no
   environment variables, no engine socket. Inputs (name, image, sha, path) are validated against injection.
   `assertNoForbiddenFlags` rejects `--privileged`, host namespaces, `-e`, `-v`, devices, etc.
3. **Probes** (`probes.ts`): hostile scripts run inside the sandbox (read host files, reach the metadata IP, read secrets,
   run as root, exhaust memory, fork-bomb, outlive the wall clock, persist data between runs, write to the root FS). A
   control is proven only when the attack is observed to be blocked; a backend that errors proves nothing.
4. **Gate** (`gate.ts`): `runtimeAvailability()` fails closed. It needs a configured backend, a matching attestation,
   every control proven, none failed, and an unexpired proof (24 h TTL, so isolation is re-proved daily).
5. **Evidence** (`check.ts`): a `sandbox.*` check is `unavailable` unless the gate is open and a run exists for the
   exact commit; it records backend, attestation time, exit code and output tail.

## Before enabling (launch blocker, needs authorization)

- Provision an isolation runtime: gVisor (`runsc`), Kata/Firecracker or an equivalent microVM. Plain containers share
  the host kernel and are not sufficient for untrusted code.
- Run on dedicated hosts or a separate cloud account with no credentials, and egress denied at the network layer too.
- Implement `SandboxBackend` for that runtime, run `runIsolationProbes` against the REAL backend, persist the
  attestation, and pass `{ backendName, attestation }` to `Deps.sandbox`.
- Source snapshots must come from the read-only GitHub fetcher at a pinned commit; dependencies from a vetted mirror.
- Never run with the project's own secrets; install uses `--ignore-scripts`.
