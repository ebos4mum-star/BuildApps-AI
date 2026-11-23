"use client";
import { useEffect, useState } from "react";
import { RESCUE_STAGES } from "@buildapps/core";
import { api, type WorkspaceView } from "@/lib/api-types";
import { RequestPanel } from "./RequestPanel";

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
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (draft) setHelp(draft);
  }, [draft]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  const closed = ws.helpRequest
    ? ["completed", "cancelled"].includes(ws.helpRequest.status)
    : false;
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

      {!ws.helpRequest || (help !== null && closed) ? (
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
        <RequestPanel requestId={ws.helpRequest.id} reload={reload} />
      )}
      {ws.helpRequest && closed && help === null && (
        <p>
          <button className="btn secondary small" onClick={() => setHelp("")}>
            Ask for more help
          </button>
        </p>
      )}
    </div>
  );
}
