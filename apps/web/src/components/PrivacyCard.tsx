"use client";
import { useCallback, useEffect, useState } from "react";
import type { DeletionRequestRow } from "@buildapps/api-client";
import { api } from "@/lib/api-types";

/** Self-service privacy: download your data, or ask for the account to be deleted (with a cooling-off period). */
export function PrivacyCard() {
  const [pending, setPending] = useState<DeletionRequestRow | null | undefined>(undefined);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api.myDeletion().then(setPending), []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  async function download() {
    setErr(null);
    try {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "buildapps-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Your data export was downloaded.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    }
  }
  async function act(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      setConfirm("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="card" aria-labelledby="privacy-h" data-testid="privacy-card">
      <h2 id="privacy-h">Your data and privacy</h2>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}
      <p className="muted">
        Download a copy of everything your account holds: progress, projects, help requests, support
        messages and notifications.
      </p>
      <button className="btn secondary small" onClick={download}>
        Download my data
      </button>
      <h3 style={{ marginTop: "1rem" }}>Delete my account</h3>
      {pending === undefined ? (
        <p className="muted" role="status">
          Loading...
        </p>
      ) : pending ? (
        <>
          <p>
            <span className="badge warn">Deletion requested</span> Your account can be erased after{" "}
            {new Date(pending.notBefore).toLocaleDateString()}. Until then you can change your mind.
          </p>
          <button
            className="btn secondary small"
            onClick={() =>
              act(() => api.cancelDeletion(), "Deletion cancelled. Your account stays.")
            }
          >
            Cancel deletion
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Erases your progress, projects and requests after a 14-day cooling-off period during
            which you can cancel. Type <code>DELETE MY ACCOUNT</code> to confirm.
          </p>
          <label htmlFor="del-confirm" className="sr-only">
            Type DELETE MY ACCOUNT to confirm
          </label>
          <input
            id="del-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE MY ACCOUNT"
          />
          <label htmlFor="del-reason" className="sr-only">
            Optional reason
          </label>
          <input
            id="del-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <button
            className="btn danger small"
            disabled={confirm !== "DELETE MY ACCOUNT"}
            onClick={() =>
              act(
                () => api.requestDeletion({ confirm, reason: reason || undefined }),
                "Deletion requested. You can cancel any time during the cooling-off period.",
              )
            }
          >
            Request account deletion
          </button>
        </>
      )}
    </section>
  );
}
