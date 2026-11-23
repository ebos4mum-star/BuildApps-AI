import type { WorkspaceView } from "@/lib/api-types";

const ICON = { pass: "✅", fail: "❌", skipped: "⏳", unavailable: "➖" } as const;
const LABEL = {
  pass: "Passed",
  fail: "Failed",
  skipped: "Pending",
  unavailable: "Unavailable",
} as const;

export function VerificationPanel({ ws }: { ws: WorkspaceView }) {
  const run = ws.latestVerification;
  const r = ws.readiness;
  return (
    <div className="card">
      <h2>Verification &amp; readiness</h2>
      <p>
        {r.ready ? (
          <span className="badge ok">Ready to publish</span>
        ) : (
          <span className="badge warn">Not ready to publish yet</span>
        )}
      </p>
      {!r.ready && (
        <ul>
          {r.blockers.map((b) => (
            <li key={b} className="muted">
              {b}
            </li>
          ))}
        </ul>
      )}
      {!run ? (
        <p className="muted">
          No verification run yet. Run verification to check CI results and static checks on the
          latest commit.
        </p>
      ) : (
        <>
          <p className="muted">
            Latest run {new Date(run.createdAt).toLocaleString()}
            {run.commitSha ? ` on ${run.commitSha.slice(0, 7)}` : ""}.
          </p>
          <ul className="checks">
            {run.checks.map((c) => (
              <li key={c.id}>
                <span aria-hidden="true">{ICON[c.status]}</span> <strong>{c.title}</strong>{" "}
                <span
                  className={`badge ${c.status === "pass" ? "ok" : c.status === "fail" ? "crit" : ""}`}
                >
                  {LABEL[c.status]}
                </span>
                <div className="muted" style={{ fontSize: ".85rem" }}>
                  {c.source === "ci_checks"
                    ? "From your repository's own CI results"
                    : c.source === "sandbox"
                      ? String((c.evidence as { reason?: string }).reason ?? "")
                      : "Static check of repository files"}
                  {c.status !== "pass" &&
                  (c.evidence as { reason?: string }).reason &&
                  c.source !== "sandbox"
                    ? ` - ${(c.evidence as { reason?: string }).reason}`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted" style={{ marginTop: ".6rem" }}>
        Milestones are marked <strong>Verified</strong> only from this kind of evidence - never from
        a claim or an AI explanation. Running your tests inside BuildApps needs an isolated sandbox,
        which is not enabled yet.
      </p>
    </div>
  );
}
