"use client";
import { useState } from "react";
import { api, type FindingRow, type FindingStatus, type WorkspaceView } from "@/lib/api-types";

const KIND: Record<FindingRow["kind"], { label: string; cls: string; help: string }> = {
  verified: {
    label: "Verified in repo",
    cls: "verified",
    help: "Observed directly in your repository.",
  },
  static_warning: {
    label: "Static warning",
    cls: "warn",
    help: "Pattern-based heuristic. May be a false positive.",
  },
  recommendation: {
    label: "Unverified recommendation",
    cls: "",
    help: "Advice only. Nothing proves it is needed.",
  },
};
const SEV_CLS: Record<string, string> = {
  critical: "crit",
  high: "crit",
  medium: "warn",
  low: "",
  info: "",
};

export function FindingsPanel({
  ws,
  reload,
  onAskExpert,
}: {
  ws: WorkspaceView;
  reload: () => Promise<void>;
  onAskExpert?: (summary: string) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const titleOf = (k: string | null) => ws.project.milestones.find((m) => m.id === k)?.title;
  const latest = ws.latestScan?.id;

  async function set(f: FindingRow, status: FindingStatus, n?: string) {
    setBusy(f.id);
    setErr(null);
    try {
      await api.setFindingStatus(ws.project.id, f.id, status, n);
      setDismissing(null);
      setNote("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }
  const active = ws.findings.filter((f) => f.status === "open" || f.status === "in_progress");
  const other = ws.findings.filter((f) => !(f.status === "open" || f.status === "in_progress"));
  if (!ws.latestScan)
    return (
      <div className="card">
        <h2>Findings</h2>
        <p className="muted">Scan the repository to get an evidence-based assessment.</p>
      </div>
    );
  const a = ws.latestScan.assessment;
  const row = (f: FindingRow) => (
    <li
      key={f.id}
      className="finding"
      style={{ opacity: f.status === "resolved" || f.status === "dismissed" ? 0.75 : 1 }}
    >
      <div>
        <span className={`badge ${SEV_CLS[f.severity]}`}>{f.severity}</span>{" "}
        <span className={`badge ${KIND[f.kind].cls}`} title={KIND[f.kind].help}>
          {KIND[f.kind].label}
        </span>
        {f.milestoneKey && titleOf(f.milestoneKey) && (
          <span className="badge">feeds: {titleOf(f.milestoneKey)}</span>
        )}
        {f.lastSeenScan !== latest && f.status !== "resolved" && (
          <span className="badge ok">not detected in latest scan</span>
        )}
        {f.status === "resolved" && (
          <span className={`badge ${f.resolutionSource === "user" ? "warn" : "ok"}`}>
            {f.resolutionSource === "user"
              ? "resolved (your claim, re-checked on next scan)"
              : "resolved - confirmed by scan"}
          </span>
        )}
        {f.status === "dismissed" && (
          <span className="badge">dismissed{f.statusNote ? `: ${f.statusNote}` : ""}</span>
        )}
      </div>
      <h3 style={{ margin: ".3rem 0" }}>{f.title}</h3>
      <p className="muted" style={{ margin: ".2rem 0" }}>
        {f.detail}
      </p>
      {f.evidence.length > 0 && (
        <ul className="evidence">
          {f.evidence.slice(0, 4).map((e, i) => (
            <li key={i}>
              <code>
                {e.path}
                {e.line ? `:${e.line}` : ""}
              </code>
              {e.snippet ? (
                <>
                  {" "}
                  - <code>{e.snippet}</code>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: ".3rem 0" }}>
        <strong>Fix:</strong> {f.remedy}
      </p>
      <div className="stats">
        <label className="sr-only" htmlFor={`st-${f.id}`}>
          Status of {f.title}
        </label>
        <select
          id={`st-${f.id}`}
          value={f.status}
          disabled={busy === f.id}
          style={{ width: "auto" }}
          onChange={(e) => {
            const s = e.target.value as FindingStatus;
            if (s === "dismissed") setDismissing(f.id);
            else void set(f, s);
          }}
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved (I fixed it)</option>
          <option value="dismissed">Dismiss (accept risk)</option>
        </select>
        {onAskExpert && !ws.helpRequest && f.status !== "resolved" && (
          <button
            type="button"
            className="btn secondary small"
            onClick={() =>
              onAskExpert(
                `Please help with this finding (${f.severity}): "${f.title}". ${f.remedy}`.slice(
                  0,
                  1900,
                ),
              )
            }
          >
            Ask an expert about this
          </button>
        )}
      </div>
      {dismissing === f.id && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void set(f, "dismissed", note);
          }}
        >
          <label className="field" htmlFor={`n-${f.id}`}>
            Why are you dismissing this? (kept as your decision)
          </label>
          <input
            id={`n-${f.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={5}
            required
          />
          <p>
            <button className="btn small" disabled={busy === f.id}>
              Save decision
            </button>{" "}
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setDismissing(null)}
            >
              Cancel
            </button>
          </p>
        </form>
      )}
    </li>
  );
  return (
    <div className="card">
      <h2>Assessment</h2>
      {a && (
        <>
          <p>
            <strong>{a.headline}</strong>
          </p>
          <p className="muted">
            {a.byKind.verified} verified - {a.byKind.static_warning} static warnings -{" "}
            {a.byKind.recommendation} recommendations. Scanned{" "}
            {new Date(ws.latestScan.createdAt).toLocaleString()}
            {ws.latestScan.commitSha ? ` at ${ws.latestScan.commitSha.slice(0, 7)}` : ""}.
          </p>
          <details>
            <summary>How to read this (limits)</summary>
            <ul>
              {a.limits.map((l) => (
                <li key={l} className="muted">
                  {l}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <h3>To do ({active.length})</h3>
      {active.length === 0 ? (
        <p className="muted">Nothing open. Nice.</p>
      ) : (
        <ol className="findings">{active.map(row)}</ol>
      )}
      {other.length > 0 && (
        <details>
          <summary>Resolved and dismissed ({other.length})</summary>
          <ol className="findings">{other.map(row)}</ol>
        </details>
      )}
    </div>
  );
}
