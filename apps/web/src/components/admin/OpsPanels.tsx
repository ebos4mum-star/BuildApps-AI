"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-types";
import type {
  DeletionRequestRow,
  HealthReport,
  AbuseReportRow,
  AdminLesson,
  AdminOverview,
  AuditRow,
  SupportRow,
  UserSummary,
} from "@buildapps/api-client";

function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, err, reload, setErr };
}
const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <div className="err" role="alert">
      {msg}
    </div>
  ) : null;
const when = (iso: string) => new Date(iso).toLocaleString();

export function OverviewPanel() {
  const { data: o, err } = useLoad<AdminOverview>(() => api.adminOverview());
  if (!o) return err ? <Err msg={err} /> : <p className="muted">Loading...</p>;
  const tiles: [string, number | string][] = [
    ["Users", o.users],
    ["Suspended", o.suspendedUsers],
    ["Open support", o.openSupport],
    ["Open abuse reports", o.openReports],
    ["Pending experts", o.pendingExperts],
    ["Awaiting match", o.awaitingMatch],
    ["Publishing assistance open", o.openPublishingAssistance],
    ["Lessons", o.lessons],
  ];
  return (
    <div data-testid="admin-overview">
      <div className="skills">
        {tiles.map(([label, n]) => (
          <div className="card" key={label}>
            <div className="muted">{label}</div>
            <strong style={{ fontSize: "1.6rem" }}>{n}</strong>
          </div>
        ))}
      </div>
      <h2>Requests by status</h2>
      <div className="stats">
        {Object.entries(o.requestsByStatus).length === 0 && (
          <span className="muted">No service requests yet.</span>
        )}
        {Object.entries(o.requestsByStatus).map(([s, n]) => (
          <span className="badge" key={s}>
            {s.replace("_", " ")}: {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function UsersPanel() {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const { data, err, reload, setErr } = useLoad<UserSummary[]>(() =>
    api.adminUsers(q || undefined),
  );
  async function suspend(u: UserSummary, suspended: boolean) {
    try {
      await api.adminSetSuspension(u.id, suspended, reason[u.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void reload();
        }}
      >
        <label className="field" htmlFor="uq">
          Search by name or id
        </label>
        <input id="uq" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
        <p>
          <button className="btn small secondary">Search</button>
        </p>
      </form>
      <Err msg={err} />
      {data?.length === 0 && <p className="muted">No users match.</p>}
      {data?.map((u) => (
        <div className="card" key={u.id}>
          <p>
            <strong>{u.displayName ?? "(no name)"}</strong> <span className="muted">{u.id}</span>{" "}
            {u.suspended && <span className="badge crit">suspended</span>}
          </p>
          {u.suspendedReason && <p className="muted">Reason: {u.suspendedReason}</p>}
          <label className="sr-only" htmlFor={`sr-${u.id}`}>
            Reason
          </label>
          <input
            id={`sr-${u.id}`}
            placeholder="Reason (required to suspend)"
            maxLength={500}
            value={reason[u.id] ?? ""}
            onChange={(e) => setReason({ ...reason, [u.id]: e.target.value })}
          />
          <p>
            {u.suspended ? (
              <button className="btn small" onClick={() => suspend(u, false)}>
                Reinstate
              </button>
            ) : (
              <button className="btn danger small" onClick={() => suspend(u, true)}>
                Suspend account
              </button>
            )}
          </p>
        </div>
      ))}
    </>
  );
}

export function SupportPanel() {
  const { data, err, reload, setErr } = useLoad<SupportRow[]>(() => api.adminSupport());
  const [note, setNote] = useState<Record<string, string>>({});
  async function set(r: SupportRow, status: SupportRow["status"]) {
    try {
      await api.adminUpdateSupport(r.id, status, note[r.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <>
      <Err msg={err} />
      {data?.length === 0 && <p className="muted">No support requests.</p>}
      {data?.map((r) => (
        <div className="card" key={r.id}>
          <p>
            <span className="badge warn">{r.status.replace("_", " ")}</span>{" "}
            <span className="badge">{r.category}</span> <strong>{r.subject}</strong>
          </p>
          <p className="muted">
            From {r.userId} · {when(r.createdAt)}
          </p>
          <p>{r.body}</p>
          {r.adminNote && <p className="muted">Note: {r.adminNote}</p>}
          {r.status !== "resolved" && r.status !== "closed" && (
            <>
              <label className="sr-only" htmlFor={`sn-${r.id}`}>
                Reply note
              </label>
              <input
                id={`sn-${r.id}`}
                placeholder="Note to the user (optional)"
                maxLength={2000}
                value={note[r.id] ?? ""}
                onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
              />
              <div className="stats" style={{ marginTop: ".5rem" }}>
                {r.status === "open" && (
                  <button className="btn secondary small" onClick={() => set(r, "in_progress")}>
                    Start working
                  </button>
                )}
                <button className="btn small" onClick={() => set(r, "resolved")}>
                  Resolve
                </button>
                <button className="btn secondary small" onClick={() => set(r, "closed")}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}

export function ReportsPanel() {
  const { data, err, reload, setErr } = useLoad<AbuseReportRow[]>(() => api.adminReports());
  const [note, setNote] = useState<Record<string, string>>({});
  async function review(r: AbuseReportRow, status: "actioned" | "dismissed") {
    try {
      await api.adminReviewReport(r.id, status, note[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <>
      <Err msg={err} />
      {data?.length === 0 && <p className="muted">No abuse reports.</p>}
      {data?.map((r) => (
        <div className="card" key={r.id}>
          <p>
            <span className={`badge ${r.status === "open" ? "warn" : ""}`}>{r.status}</span>{" "}
            <span className="badge crit">{r.reason.replace("_", " ")}</span> against {r.targetType}{" "}
            <code>{r.targetId}</code>
          </p>
          <p className="muted">
            Reported by {r.reporterId} · {when(r.createdAt)}
          </p>
          {r.detail && <p>{r.detail}</p>}
          {r.reviewNote && <p className="muted">Decision: {r.reviewNote}</p>}
          {r.status === "open" && (
            <>
              <label className="sr-only" htmlFor={`rn-${r.id}`}>
                Decision note
              </label>
              <input
                id={`rn-${r.id}`}
                placeholder="Decision note (required)"
                maxLength={2000}
                value={note[r.id] ?? ""}
                onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
              />
              <div className="stats" style={{ marginTop: ".5rem" }}>
                <button className="btn small" onClick={() => review(r, "actioned")}>
                  Mark actioned
                </button>
                <button className="btn secondary small" onClick={() => review(r, "dismissed")}>
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}

export function ContentPanel() {
  const { data, err, reload, setErr } = useLoad<AdminLesson[]>(() => api.adminContent());
  const [note, setNote] = useState<Record<string, string>>({});
  async function set(l: AdminLesson, disabled: boolean) {
    try {
      await api.adminSetLesson(l.id, disabled, note[l.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <>
      <p className="muted">
        Lessons live in the repository. Withholding one hides it from learners until you restore it.
      </p>
      <Err msg={err} />
      {data?.map((l) => (
        <div className="card" key={l.id}>
          <p>
            <strong>{l.title}</strong> <code>{l.id}</code>{" "}
            <span className="muted">
              {l.skillId} · {l.exercises} exercises
            </span>{" "}
            {l.disabled && <span className="badge crit">withheld</span>}
          </p>
          {l.note && <p className="muted">Note: {l.note}</p>}
          {l.disabled ? (
            <button className="btn small" onClick={() => set(l, false)}>
              Restore
            </button>
          ) : (
            <div className="stats">
              <label className="sr-only" htmlFor={`cn-${l.id}`}>
                Reason
              </label>
              <input
                id={`cn-${l.id}`}
                style={{ flex: 1 }}
                placeholder="Why withhold it?"
                maxLength={500}
                value={note[l.id] ?? ""}
                onChange={(e) => setNote({ ...note, [l.id]: e.target.value })}
              />
              <button className="btn danger small" onClick={() => set(l, true)}>
                Withhold
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function AuditPanel() {
  const { data, err } = useLoad<AuditRow[]>(() => api.adminAudit());
  return (
    <>
      <p className="muted">Immutable record of administrative actions (newest first).</p>
      <Err msg={err} />
      {data?.length === 0 && <p className="muted">Nothing recorded yet.</p>}
      <ul className="checks" data-testid="audit-log">
        {data?.map((a) => (
          <li key={a.id}>
            <code>{a.action}</code> on {a.targetType} <code>{a.targetId}</code>{" "}
            <span className="muted">
              by {a.actorId ?? "system"} · {when(a.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PrivacyPanel() {
  const { data, err, reload, setErr } = useLoad<DeletionRequestRow[]>(() => api.adminDeletions());
  const [note, setNote] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<Record<string, string>>({});
  async function execute(r: DeletionRequestRow) {
    try {
      await api.adminExecuteErasure(r.id, confirmId[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  async function record(r: DeletionRequestRow) {
    try {
      await api.adminRecordErasure(r.id, note[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <>
      <p className="muted">
        Account deletion requests. Record an erasure only after carrying it out per docs/PRIVACY.md
        and after the cooling-off period ends.
      </p>
      <Err msg={err} />
      {data?.length === 0 && <p className="muted">No deletion requests.</p>}
      {data?.map((r) => {
        const ready = r.status === "pending" && Date.parse(r.notBefore) <= Date.now();
        return (
          <div className="card" key={r.id}>
            <p>
              <span className="badge warn">{r.status}</span> user <code>{r.userId}</code>
            </p>
            <p className="muted">
              Requested {when(r.requestedAt)} · erasable after {when(r.notBefore)}
              {r.reason ? ` · reason: ${r.reason}` : ""}
            </p>
            {r.status === "pending" &&
              (ready ? (
                <>
                  <label className="sr-only" htmlFor={`er-${r.id}`}>
                    Erasure note
                  </label>
                  <input
                    id={`er-${r.id}`}
                    placeholder="What was erased and how"
                    value={note[r.id] ?? ""}
                    onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
                  />
                  <button className="btn danger small" onClick={() => record(r)}>
                    Record erasure done elsewhere
                  </button>
                  <label className="sr-only" htmlFor={`ex-${r.id}`}>
                    Type the account id to erase
                  </label>
                  <input
                    id={`ex-${r.id}`}
                    placeholder={`Type ${r.userId} to permanently erase now`}
                    value={confirmId[r.id] ?? ""}
                    onChange={(e) => setConfirmId({ ...confirmId, [r.id]: e.target.value })}
                  />
                  <button
                    className="btn danger small"
                    disabled={(confirmId[r.id] ?? "") !== r.userId}
                    onClick={() => execute(r)}
                  >
                    Erase account permanently
                  </button>
                </>
              ) : (
                <p className="muted">Cooling-off period still running.</p>
              ))}
          </div>
        );
      })}
    </>
  );
}

export function HealthPanel() {
  const { data, err } = useLoad<HealthReport>(() => api.adminHealth());
  if (!data) return err ? <Err msg={err} /> : <p className="muted">Loading...</p>;
  return (
    <div data-testid="health">
      <p className="muted">Generated {when(data.generatedAt)}. Read-only.</p>
      {data.attention.length === 0 ? (
        <p>
          <span className="badge ok">Nothing needs attention</span>
        </p>
      ) : (
        <ul role="status">
          {data.attention.map((a) => (
            <li key={a}>
              <span className="badge warn">Attention</span> {a}
            </li>
          ))}
        </ul>
      )}
      <h3>Integrations</h3>
      <ul className="checks">
        {data.integrations.map((i) => (
          <li key={i.id}>
            <strong>{i.label}</strong>{" "}
            <span className={`badge ${i.status === "configured" ? "ok" : ""}`}>
              {i.status === "configured" ? "Configured (not verified live)" : "Not configured"}
            </span>
            <div className="muted">{i.note}</div>
          </li>
        ))}
      </ul>
      <h3>Delivery queue</h3>
      <p className="muted">
        {data.notifications.pending} pending · {data.notifications.failed} failed ·{" "}
        {data.notifications.sentLast24h} sent and {data.notifications.skippedLast24h} skipped in the
        last 24h
      </p>
      <h3>Support and privacy</h3>
      <p className="muted">
        {data.support.open} open support requests
        {data.support.oldestOpenHours !== null
          ? ` (oldest ${data.support.oldestOpenHours}h)`
          : ""}{" "}
        · {data.privacy.pendingDeletions} pending deletions ({data.privacy.readyForReview} past
        cooling-off) · erasure {data.privacy.erasureEnabled ? "enabled" : "disabled"} on this server
      </p>
    </div>
  );
}
