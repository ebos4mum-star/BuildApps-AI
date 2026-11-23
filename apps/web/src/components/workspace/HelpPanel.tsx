"use client";
import { useCallback, useEffect, useState } from "react";
import { RESCUE_STAGES } from "@buildapps/core";
import { api, type HandoffScope, type RequestView, type WorkspaceView } from "@/lib/api-types";

const SCOPES: { id: HandoffScope; label: string; help: string }[] = [
  {
    id: "view_project",
    label: "Project overview & milestones",
    help: "Name, stage, repository name, milestones",
  },
  { id: "view_scans", label: "Scan assessments", help: "Summaries of scans" },
  {
    id: "view_findings",
    label: "Findings",
    help: "Issues, evidence excerpts (secrets are redacted) and fixes",
  },
  { id: "view_verification", label: "Verification results", help: "CI and static-check outcomes" },
];
const STATUS_TEXT: Record<string, string> = {
  submitted: "Waiting for us to match you with a vetted expert",
  matched: "Matched - the expert is reviewing the job",
  in_progress: "In progress",
  delivered: "Expert says the work is delivered - review it",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function HelpPanel({
  ws,
  reload,
  draft,
  onDraftUsed,
}: {
  ws: WorkspaceView;
  reload: () => Promise<void>;
  /** Pre-filled request text (e.g. from "Ask an expert about this finding"). */
  draft?: string | null;
  onDraftUsed?: () => void;
}) {
  const p = ws.project;
  const [help, setHelp] = useState<string | null>(null);
  const [view, setView] = useState<RequestView | null>(null);
  const [scopes, setScopes] = useState<HandoffScope[]>(["view_project", "view_findings"]);
  const [days, setDays] = useState(7);
  const [reject, setReject] = useState<{ job: string; note: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reqId = ws.helpRequest?.id;
  useEffect(() => {
    if (draft) setHelp(draft);
  }, [draft]);

  const load = useCallback(async () => {
    if (reqId) setView(await api.myRequest(reqId));
    else setView(null);
  }, [reqId]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await reload();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  const stageIdx = p.recovery ? RESCUE_STAGES.indexOf(p.recovery.stage) : -1;

  return (
    <div className="card" id="expert-help">
      <h2>{p.recovery ? "Recovery & expert help" : "Expert help"}</h2>
      {p.recovery && (
        <div className="steps" role="list" aria-label="Recovery stages">
          {RESCUE_STAGES.map((s, i) => (
            <span
              key={s}
              role="listitem"
              className={`s ${i < stageIdx ? "past" : i === stageIdx ? "on" : ""}`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>
      )}
      {p.recovery && stageIdx < RESCUE_STAGES.length - 1 && (
        <button
          className="btn small"
          disabled={busy}
          onClick={() => act(() => api.advanceRecovery(p.id))}
        >
          Next stage
        </button>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}

      {!view || (help !== null && ["completed", "cancelled"].includes(view.request.status)) ? (
        help === null ? (
          <p>
            <button className="btn secondary small" onClick={() => setHelp("")}>
              Ask a vetted developer for help
            </button>
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api.requestHumanHelp(p.id, help);
                setHelp(null);
                onDraftUsed?.();
              });
            }}
          >
            <label className="field" htmlFor="help">
              What do you need help with?
            </label>
            <textarea
              id="help"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={help}
              onChange={(e) => setHelp(e.target.value)}
            />
            <p className="muted">
              Nothing is shared with anyone until you approve a scoped, time-limited handoff. No
              payment is taken in this version.
            </p>
            <button className="btn small" disabled={busy}>
              Send request
            </button>
          </form>
        )
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <p>
            <strong>Expert request:</strong>{" "}
            <span className="badge warn">
              {STATUS_TEXT[view.request.status] ?? view.request.status}
            </span>
          </p>
          <p className="muted">{view.request.summary}</p>
          {view.expert && (
            <p>
              Matched expert: <strong>{view.expert.displayName}</strong>
              {view.expert.headline ? ` - ${view.expert.headline}` : ""}{" "}
              {view.expert.skills.length > 0 && (
                <span className="muted">({view.expert.skills.join(", ")})</span>
              )}
            </p>
          )}

          {(view.request.status === "matched" || view.request.status === "in_progress") && (
            <div className="subcard">
              <h3>Project access for your expert</h3>
              {view.handoff ? (
                <>
                  <p>
                    Granted:{" "}
                    {view.handoff.scopes
                      .map((s) => SCOPES.find((x) => x.id === s)?.label)
                      .join(", ")}
                    . Expires {new Date(view.handoff.expiresAt).toLocaleString()}.
                  </p>
                  <button
                    className="btn danger small"
                    disabled={busy}
                    onClick={() => act(() => api.revokeHandoff(view.request.id))}
                  >
                    Revoke access now
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(() => api.grantHandoff(view.request.id, scopes, days));
                  }}
                >
                  <fieldset style={{ border: 0, padding: 0 }}>
                    <legend className="muted">
                      Choose exactly what your expert may see. They never get your source code or
                      credentials through BuildApps.
                    </legend>
                    {SCOPES.map((s) => (
                      <label key={s.id} style={{ display: "block", margin: ".3rem 0" }}>
                        <input
                          type="checkbox"
                          style={{ width: "auto", marginRight: ".5rem" }}
                          checked={scopes.includes(s.id)}
                          onChange={(e) =>
                            setScopes(
                              e.target.checked
                                ? [...scopes, s.id]
                                : scopes.filter((x) => x !== s.id),
                            )
                          }
                        />
                        {s.label} <span className="muted">- {s.help}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="field" htmlFor="days">
                    Access lasts
                  </label>
                  <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {[1, 3, 7, 14, 30].map((d) => (
                      <option key={d} value={d}>
                        {d} day{d > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                  <p>
                    <button className="btn small" disabled={busy || scopes.length === 0}>
                      Grant access
                    </button>
                  </p>
                </form>
              )}
            </div>
          )}

          {view.jobs.length > 0 && (
            <div className="subcard">
              <h3>Job milestones</h3>
              {view.jobs.map((j) => (
                <div
                  className="ms"
                  key={j.id}
                  style={{ alignItems: "flex-start", flexWrap: "wrap" }}
                >
                  <span className="t">
                    {j.title}
                    <div className="muted" style={{ fontWeight: 400 }}>
                      {j.description}
                    </div>
                    {j.deliverableNote && (
                      <div className="muted" style={{ fontWeight: 400 }}>
                        Deliverable: {j.deliverableNote}
                        {j.deliverableUrl ? (
                          <>
                            {" "}
                            -{" "}
                            <a href={j.deliverableUrl} target="_blank" rel="noopener noreferrer">
                              link
                            </a>
                          </>
                        ) : null}
                      </div>
                    )}
                    {j.decisionNote && (
                      <div className="muted" style={{ fontWeight: 400 }}>
                        Your note: {j.decisionNote}
                      </div>
                    )}
                  </span>
                  <span
                    className={`badge ${j.status === "accepted" ? "ok" : j.status === "rejected" ? "crit" : j.status === "submitted" ? "warn" : ""}`}
                  >
                    {j.status}
                  </span>
                  {j.status === "submitted" && (
                    <>
                      <button
                        className="btn small"
                        disabled={busy}
                        onClick={() => act(() => api.decideJob(view.request.id, j.id, "accept"))}
                      >
                        Accept
                      </button>
                      <button
                        className="btn secondary small"
                        disabled={busy}
                        onClick={() => setReject({ job: j.id, note: "" })}
                      >
                        Needs changes
                      </button>
                    </>
                  )}
                  {reject?.job === j.id && (
                    <form
                      style={{ width: "100%" }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(async () => {
                          await api.decideJob(view.request.id, j.id, "reject", reject.note);
                          setReject(null);
                        });
                      }}
                    >
                      <label className="field" htmlFor={`r-${j.id}`}>
                        What needs to change?
                      </label>
                      <input
                        id={`r-${j.id}`}
                        required
                        value={reject.note}
                        onChange={(e) => setReject({ job: j.id, note: e.target.value })}
                      />
                      <p>
                        <button className="btn small" disabled={busy}>
                          Send feedback
                        </button>
                      </p>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="stats">
            {view.request.status === "delivered" && (
              <button
                className="btn small"
                disabled={busy || view.jobs.some((j) => j.status !== "accepted")}
                onClick={() => act(() => api.completeRequest(view.request.id))}
              >
                Confirm job complete
              </button>
            )}
            {["submitted", "matched", "in_progress"].includes(view.request.status) && (
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={() => {
                  if (confirm("Cancel this request? Any expert access is revoked."))
                    void act(() => api.cancelRequest(view.request.id));
                }}
              >
                Cancel request
              </button>
            )}
          </div>
          {view.request.status === "completed" && (
            <p className="muted">
              Completed{" "}
              {view.request.completedAt
                ? new Date(view.request.completedAt).toLocaleDateString()
                : ""}
              . Completion is accepted by you, and linked to the project&apos;s latest scan and
              verification evidence.
            </p>
          )}

          {view.events.length > 0 && (
            <details open={view.events.length <= 6}>
              <summary>Job activity ({view.events.length})</summary>
              <ol className="timeline" aria-label="Job activity">
                {view.events.map((e) => (
                  <li key={e.id}>
                    <strong>{ACTION_TEXT[e.action] ?? e.action.replace(/_/g, " ")}</strong>{" "}
                    <span className="muted">
                      by {e.actorRole} - {new Date(e.createdAt).toLocaleString()}
                    </span>
                    {typeof e.detail.milestone === "string" && (
                      <div className="muted">{e.detail.milestone}</div>
                    )}
                    {typeof e.detail.note === "string" && e.detail.note && (
                      <div className="muted">&ldquo;{e.detail.note}&rdquo;</div>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {["completed", "cancelled"].includes(view.request.status) && help === null && (
            <p>
              <button className="btn secondary small" onClick={() => setHelp("")}>
                Ask for more help
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  request_created: "Help requested",
  matched: "Matched with an expert",
  accepted: "Expert accepted the job",
  declined: "Expert declined the job",
  handoff_granted: "Project access granted",
  handoff_revoked: "Project access ended",
  milestone_added: "Milestone added",
  milestone_submitted: "Work submitted",
  revision_requested: "Revision requested",
  milestone_accepted: "Work accepted",
  delivered: "Marked delivered",
  completed: "Job completed",
  cancelled: "Request cancelled",
};
