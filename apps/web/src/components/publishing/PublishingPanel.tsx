"use client";
import { useCallback, useEffect, useState } from "react";
import { PLATFORM_LABEL, type Platform } from "@buildapps/publishing";
import { api, type PublishingView } from "@/lib/api-types";
import { RequestPanel } from "@/components/workspace/RequestPanel";
import { TargetCard } from "./TargetCard";

export function PublishingPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<PublishingView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assist, setAssist] = useState<string | null>(null);
  const load = useCallback(async () => setView(await api.publishing.view(projectId)), [projectId]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  if (!view)
    return (
      <div className="card" id="publishing">
        <h2>Publishing Center</h2>
        {err ? (
          <div className="err" role="alert">
            {err}
          </div>
        ) : (
          <p className="muted" role="status">
            Loading...
          </p>
        )}
      </div>
    );
  const help = view.helpRequest;
  const closed = help ? ["completed", "cancelled"].includes(help.status) : false;

  return (
    <div id="publishing">
      <div className="card">
        <h2>Publishing Center</h2>
        <p className="muted">
          Track what is needed to publish on each store, and follow a release from preparation
          through review. Everything about submissions is <strong>recorded by you</strong>:
          BuildApps does not connect to the App Store, Google Play or your host, has not submitted
          anything, and never calls an app approved or compliant.
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
        {view.availablePlatforms.length > 0 && (
          <div className="stats">
            {view.availablePlatforms.map((p: Platform) => (
              <button
                key={p}
                className="btn secondary small"
                disabled={busy}
                onClick={() =>
                  act(() => api.publishing.addTarget(projectId, p), `${PLATFORM_LABEL[p]} added.`)
                }
              >
                + {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        {view.targets.length === 0 && <p className="muted">Choose where you plan to publish.</p>}
      </div>

      {view.targets.map((t) => (
        <TargetCard key={t.target.id} v={t} projectId={projectId} act={act} busy={busy} />
      ))}

      <div className="card">
        <h2>Publishing Assistance</h2>
        {help && !(assist !== null && closed) ? (
          <>
            <p className="muted">{help.summary}</p>
            <RequestPanel requestId={help.id} reload={load} />
            {closed && (
              <p>
                <button className="btn secondary small" onClick={() => setAssist("")}>
                  Request Publishing Assistance again
                </button>
              </p>
            )}
          </>
        ) : assist === null ? (
          <>
            <p className="muted">
              Ask a vetted expert to help you get ready to publish. You choose what they can see,
              for how long, and can revoke it. No payment is taken in this version.
            </p>
            <button className="btn secondary small" onClick={() => setAssist("")}>
              Request Publishing Assistance
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api.publishing.requestAssistance(
                  projectId,
                  assist,
                  view.targets[0]?.target.id,
                );
                setAssist(null);
              }, "Request sent.");
            }}
          >
            <label className="field" htmlFor="assist">
              What do you need help with?
            </label>
            <textarea
              id="assist"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={assist}
              onChange={(e) => setAssist(e.target.value)}
            />
            <p className="muted">
              Do not include passwords or keys. Manage expert access from the &quot;Recovery &amp;
              expert help&quot; panel once you are matched.
            </p>
            <p>
              <button className="btn small" disabled={busy}>
                Send request
              </button>
            </p>
          </form>
        )}
      </div>

      {view.events.length > 0 && (
        <details className="card">
          <summary>
            <strong>Publishing activity ({view.events.length})</strong>
          </summary>
          <ol className="timeline" aria-label="Publishing activity">
            {[...view.events].reverse().map((e) => (
              <li key={e.id}>
                <strong>{e.action.replace(/_/g, " ")}</strong>{" "}
                <span className="muted">{new Date(e.createdAt).toLocaleString()}</span>
                {typeof e.detail.note === "string" && <div className="muted">{e.detail.note}</div>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
