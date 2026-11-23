"use client";
import { useState } from "react";
import {
  ACTION_STATUSES,
  REASON_CATEGORIES,
  REVIEW_OUTCOMES,
  type ActionStatus,
  type ReasonCategory,
  type ReviewOutcome,
} from "@buildapps/publishing";
import { api, type PublishingView } from "@/lib/api-types";

type ReleaseV = PublishingView["targets"][number]["releases"][number];
const STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to submit",
  submitted: "Submitted (reported by you)",
  in_review: "In review (reported by you)",
  rejected: "Rejected (reported by you)",
  approved: "Approved (reported by you - not checked with the store)",
  released: "Released (reported by you)",
  withdrawn: "Withdrawn",
};
const LABEL: Record<string, string> = {
  metadata: "Listing / metadata",
  privacy: "Privacy",
  crash_or_bug: "Crash or bug",
  guideline: "Guideline",
  security: "Security",
  legal: "Legal / content",
  performance: "Performance",
  other: "Other",
};

export function ReleaseCard({
  v,
  act,
  busy,
}: {
  v: ReleaseV;
  act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
  busy: boolean;
}) {
  const r = v.release;
  const [ref, setRef] = useState("");
  const [outcomeForm, setOutcomeForm] = useState(false);
  const [o, setO] = useState<{
    outcome: ReviewOutcome;
    category: ReasonCategory;
    guideline: string;
    message: string;
  }>({ outcome: "rejected", category: "metadata", guideline: "", message: "" });
  const [newAction, setNewAction] = useState("");
  const [wontFix, setWontFix] = useState<{ id: string; note: string } | null>(null);
  const active = r.status === "submitted" || r.status === "in_review";

  return (
    <div className="subcard" data-testid={`release-${r.version}`}>
      <p style={{ margin: 0 }}>
        <strong>v{r.version}</strong>
        {r.buildNumber ? ` (build ${r.buildNumber})` : ""}{" "}
        <span
          className={`badge ${r.status === "rejected" ? "crit" : r.status === "approved" || r.status === "released" ? "warn" : ""}`}
        >
          {STATUS_TEXT[r.status]}
        </span>
      </p>
      {r.notes && (
        <p className="muted" style={{ margin: ".2rem 0" }}>
          {r.notes}
        </p>
      )}
      {v.gate.reasons.length > 0 && ["draft", "ready", "rejected"].includes(r.status) && (
        <ul className="muted">
          {v.gate.reasons.slice(0, 5).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}

      <div className="stats">
        {r.status === "draft" && (
          <button
            className="btn small"
            disabled={busy || !v.gate.canMarkReady}
            onClick={() => act(() => api.publishing.markReady(r.id), "Marked ready.")}
          >
            Mark ready to submit
          </button>
        )}
        {r.status === "ready" && (
          <button
            className="btn secondary small"
            disabled={busy}
            onClick={() => act(() => api.publishing.unready(r.id))}
          >
            Back to draft
          </button>
        )}
        {["draft", "ready", "submitted", "in_review", "rejected"].includes(r.status) && (
          <button
            className="btn secondary small"
            disabled={busy}
            onClick={() => {
              if (confirm("Withdraw this release?")) void act(() => api.publishing.withdraw(r.id));
            }}
          >
            Withdraw
          </button>
        )}
        {r.status === "submitted" && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => act(() => api.publishing.markInReview(r.id))}
          >
            Store started review
          </button>
        )}
        {active && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => setOutcomeForm(!outcomeForm)}
          >
            Record review result
          </button>
        )}
        {r.status === "approved" && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => act(() => api.publishing.markReleased(r.id), "Marked released.")}
          >
            I released it
          </button>
        )}
      </div>

      {r.status === "ready" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () => api.publishing.recordSubmission(r.id, ref || undefined),
              "Submission recorded.",
            );
          }}
        >
          <p className="muted">
            BuildApps does not submit anything. Submit in the store yourself, then record it here.
          </p>
          <label className="field" htmlFor={`ref-${r.id}`}>
            Store reference (optional, e.g. build uploaded)
          </label>
          <input
            id={`ref-${r.id}`}
            value={ref}
            maxLength={200}
            onChange={(e) => setRef(e.target.value)}
          />
          <p>
            <button className="btn small" disabled={busy || !v.gate.canSubmit}>
              I submitted this to the store
            </button>
          </p>
        </form>
      )}

      {outcomeForm && active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.publishing.recordOutcome(
                r.id,
                o.outcome,
                o.message,
                o.outcome === "approved" ? undefined : o.category,
                o.guideline || undefined,
              );
              setOutcomeForm(false);
              setO({ ...o, message: "", guideline: "" });
            }, "Review result recorded.");
          }}
        >
          <label className="field" htmlFor={`oc-${r.id}`}>
            What did the store say?
          </label>
          <select
            id={`oc-${r.id}`}
            value={o.outcome}
            onChange={(e) => setO({ ...o, outcome: e.target.value as ReviewOutcome })}
          >
            {REVIEW_OUTCOMES.map((x) => (
              <option key={x} value={x}>
                {x === "rejected"
                  ? "Rejected"
                  : x === "approved"
                    ? "Approved"
                    : "More information requested"}
              </option>
            ))}
          </select>
          {o.outcome !== "approved" && (
            <>
              <label className="field" htmlFor={`rc-${r.id}`}>
                Main reason
              </label>
              <select
                id={`rc-${r.id}`}
                value={o.category}
                onChange={(e) => setO({ ...o, category: e.target.value as ReasonCategory })}
              >
                {REASON_CATEGORIES.map((x) => (
                  <option key={x} value={x}>
                    {LABEL[x]}
                  </option>
                ))}
              </select>
              <label className="field" htmlFor={`gr-${r.id}`}>
                Guideline reference (optional)
              </label>
              <input
                id={`gr-${r.id}`}
                value={o.guideline}
                maxLength={40}
                onChange={(e) => setO({ ...o, guideline: e.target.value })}
                placeholder="e.g. 5.1.1"
              />
            </>
          )}
          <label className="field" htmlFor={`msg-${r.id}`}>
            Reviewer message (paste or summarise)
          </label>
          <textarea
            id={`msg-${r.id}`}
            required
            rows={3}
            maxLength={4000}
            value={o.message}
            onChange={(e) => setO({ ...o, message: e.target.value })}
          />
          <p className="muted">
            This is recorded as your report. BuildApps cannot confirm it with the store.
          </p>
          <p>
            <button className="btn small" disabled={busy}>
              Save result
            </button>
          </p>
        </form>
      )}

      {r.status === "rejected" && (
        <div>
          <p>
            <strong>Fix these, then resubmit</strong>{" "}
            {v.unresolvedActions > 0 && (
              <span className="badge crit">{v.unresolvedActions} unresolved</span>
            )}
          </p>
          <button
            className="btn small"
            disabled={busy || !v.gate.canResubmit}
            onClick={() => act(() => api.publishing.resubmit(r.id), "Resubmission recorded.")}
          >
            I resubmitted this to the store
          </button>
        </div>
      )}

      {v.actions.length > 0 && (
        <ul className="findings" aria-label="Corrective actions">
          {v.actions.map((a) => (
            <li key={a.id} className="finding">
              <strong>{a.title}</strong>{" "}
              <span className={`badge ${a.status === "done" ? "ok" : ""}`}>
                {a.status.replace("_", " ")}
              </span>
              {a.detail && <div className="muted">{a.detail}</div>}
              {a.requirementKey && <div className="muted">Re-check: {a.requirementKey}</div>}
              {a.note && <div className="muted">Note: {a.note}</div>}
              <label className="sr-only" htmlFor={`as-${a.id}`}>
                Status of {a.title}
              </label>
              <select
                id={`as-${a.id}`}
                style={{ width: "auto" }}
                value={a.status}
                disabled={busy}
                onChange={(e) => {
                  const s = e.target.value as ActionStatus;
                  if (s === "wont_fix") setWontFix({ id: a.id, note: "" });
                  else void act(() => api.publishing.updateAction(a.id, s));
                }}
              >
                {ACTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "wont_fix" ? "Won't fix (give a reason)" : s.replace("_", " ")}
                  </option>
                ))}
              </select>
              {wontFix?.id === a.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await api.publishing.updateAction(a.id, "wont_fix", wontFix.note);
                      setWontFix(null);
                    });
                  }}
                >
                  <label className="field" htmlFor={`wf-${a.id}`}>
                    Why not?
                  </label>
                  <input
                    id={`wf-${a.id}`}
                    required
                    minLength={5}
                    value={wontFix.note}
                    onChange={(e) => setWontFix({ id: a.id, note: e.target.value })}
                  />
                  <p>
                    <button className="btn small">Save</button>
                  </p>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!["released", "withdrawn"].includes(r.status) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.publishing.addAction(r.id, newAction);
              setNewAction("");
            });
          }}
        >
          <label className="field" htmlFor={`na-${r.id}`}>
            Add a task
          </label>
          <input
            id={`na-${r.id}`}
            minLength={3}
            maxLength={120}
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="e.g. Update screenshots for 6.7-inch devices"
          />
          <p>
            <button className="btn secondary small" disabled={busy || newAction.trim().length < 3}>
              Add task
            </button>
          </p>
        </form>
      )}

      {(v.submissions.length > 0 || v.feedback.length > 0) && (
        <details>
          <summary>
            History ({v.submissions.length} attempt{v.submissions.length === 1 ? "" : "s"})
          </summary>
          <ol className="timeline">
            {v.submissions.map((s) => (
              <li key={s.id}>
                <strong>Attempt {s.attemptNumber}</strong>{" "}
                <span className="badge">{s.status.replace("_", " ")}</span>{" "}
                <span className="muted">
                  {new Date(s.submittedAt).toLocaleDateString()}
                  {s.storeReference ? ` - ${s.storeReference}` : ""}
                </span>
                {v.feedback
                  .filter((f) => f.submissionId === s.id)
                  .map((f) => (
                    <div key={f.id} className="muted">
                      {f.outcome.replace("_", " ")}
                      {f.outcome !== "approved"
                        ? ` (${LABEL[f.reasonCategory]}${f.guidelineRef ? `, ${f.guidelineRef}` : ""})`
                        : ""}
                      : &ldquo;{f.message}&rdquo;
                    </div>
                  ))}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
