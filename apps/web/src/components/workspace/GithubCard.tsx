"use client";
import { useEffect, useState } from "react";
import { api, type InstallationRow, type RepoInfo, type WorkspaceView } from "@/lib/api-types";

const describe = (v: { milestoneKey: string; reason: string }[]) =>
  v.length === 0
    ? "No milestones were newly verified."
    : `Verified: ${v.map((x) => x.milestoneKey).join(", ")}.`;

export function GithubCard({ ws, reload }: { ws: WorkspaceView; reload: () => Promise<void> }) {
  const [status, setStatus] = useState<{
    available: boolean;
    connections: InstallationRow[];
  } | null>(null);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [conn, setConn] = useState<string>("");
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .githubStatus()
      .then((s) => {
        setStatus(s);
        if (s.connections[0]) setConn(s.connections[0].id);
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!conn || ws.github.connected) return;
    api
      .githubRepos(conn)
      .then((r) => {
        setRepos(r);
        const want = ws.project.repo
          ? `${ws.project.repo.owner}/${ws.project.repo.name}`.toLowerCase()
          : null;
        setPick(r.find((x) => x.fullName.toLowerCase() === want)?.fullName ?? r[0]?.fullName ?? "");
      })
      .catch((e) => setErr(e.message));
  }, [conn, ws.github.connected, ws.project.repo]);

  async function run<T>(name: string, fn: () => Promise<T>, after?: (r: T) => string) {
    setBusy(name);
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      if (after) setMsg(after(r));
      await reload();
      // connections may have changed (e.g. disconnected): never show a stale connection or repo list
      const s = await api.githubStatus();
      setStatus(s);
      setConn((cur) =>
        s.connections.some((c) => c.id === cur) ? cur : (s.connections[0]?.id ?? ""),
      );
      setRepos(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (!status)
    return (
      <div className="card">
        <p className="muted" role="status">
          Loading GitHub...
        </p>
      </div>
    );
  return (
    <div className="card">
      <h2>GitHub repository</h2>
      <p className="muted">
        Read-only access: BuildApps can read the contents, metadata and CI results of the
        repositories <em>you choose</em> on GitHub. It never changes your code and never runs it.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {msg && (
        <p role="status" className="badge ok" style={{ whiteSpace: "normal" }}>
          {msg}
        </p>
      )}

      {!status.available ? (
        <p className="muted">GitHub integration is not configured on this server.</p>
      ) : ws.github.connected ? (
        <>
          <p>
            <strong>{ws.github.repo}</strong>{" "}
            <span className="badge ok">connected via {ws.github.accountLogin}</span>
          </p>
          <div className="stats">
            <button
              className="btn small"
              disabled={!!busy}
              onClick={() =>
                run(
                  "scan",
                  () => api.scan(ws.project.id),
                  (r) =>
                    `Scan complete. ${r.sync.new} new, ${r.sync.resolved} resolved. ${describe(r.verified)}`,
                )
              }
            >
              {busy === "scan" ? "Scanning..." : "Scan repository"}
            </button>
            <button
              className="btn small"
              disabled={!!busy}
              onClick={() =>
                run(
                  "verify",
                  () => api.verify(ws.project.id),
                  (r) => `Verification recorded. ${describe(r.verified)}`,
                )
              }
            >
              {busy === "verify" ? "Verifying..." : "Run verification"}
            </button>
            <button
              className="btn secondary small"
              disabled={!!busy}
              onClick={() => {
                if (confirm("Disconnect GitHub and revoke BuildApps' access to your repositories?"))
                  run(
                    "disc",
                    () => api.githubDisconnect(ws.github.installationRowId!),
                    (r) =>
                      r.remoteRevoked
                        ? "Disconnected. GitHub access was revoked."
                        : (r.note ?? "Disconnected."),
                  );
              }}
            >
              Disconnect &amp; revoke
            </button>
          </div>
        </>
      ) : status.connections.length === 0 ? (
        <button
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run("connect", async () => {
              const { url } = await api.githubConnect();
              window.location.href = url;
            })
          }
        >
          Connect GitHub (read-only)
        </button>
      ) : (
        <>
          {status.connections.length > 1 && (
            <>
              <label className="field" htmlFor="conn">
                GitHub account
              </label>
              <select id="conn" value={conn} onChange={(e) => setConn(e.target.value)}>
                {status.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.accountLogin}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="field" htmlFor="repo">
            Repository for this project
          </label>
          {repos === null ? (
            <p className="muted">Loading repositories...</p>
          ) : repos.length === 0 ? (
            <p className="muted">
              No repositories are shared with BuildApps yet. Add some in your GitHub App settings.
            </p>
          ) : (
            <select
              id="repo"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={!!ws.project.repo}
            >
              {repos.map((r) => (
                <option key={r.id} value={r.fullName}>
                  {r.fullName}
                  {r.private ? " (private)" : ""}
                </option>
              ))}
            </select>
          )}
          <p>
            <button
              className="btn"
              disabled={!!busy || !pick}
              onClick={() =>
                run(
                  "link",
                  () => api.linkRepo(ws.project.id, conn, pick),
                  (r) => `Linked ${r.repo}.`,
                )
              }
            >
              Link repository
            </button>
          </p>
        </>
      )}
    </div>
  );
}
