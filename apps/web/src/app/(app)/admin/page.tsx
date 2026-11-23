"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type ExpertRow, type ServiceRequestRow } from "@/lib/api-types";

export default function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [experts, setExperts] = useState<ExpertRow[]>([]);
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const a = await api.adminMe();
    setAdmin(a);
    if (a) {
      setExperts(await api.adminExperts());
      setRequests(await api.adminRequests());
    }
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  if (admin === null)
    return err ? (
      <div className="err" role="alert">
        {err}
      </div>
    ) : (
      <p className="muted">Loading...</p>
    );
  if (!admin)
    return (
      <div className="card">
        <h1>Administration</h1>
        <p className="muted">This area is for BuildApps administrators.</p>
      </div>
    );
  const approved = experts.filter((e) => e.status === "approved");
  const name = (id: string | null) => experts.find((e) => e.id === id)?.displayName ?? "-";
  return (
    <>
      <h1>Administration</h1>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <h2>Expert applications</h2>
      {experts.length === 0 && <p className="muted">No applications yet.</p>}
      {experts.map((e) => (
        <div className="card" key={e.id}>
          <p>
            <strong>{e.displayName}</strong>{" "}
            <span
              className={`badge ${e.status === "approved" ? "ok" : e.status === "pending" ? "warn" : "crit"}`}
            >
              {e.status}
            </span>{" "}
            {e.headline && <span className="muted">{e.headline}</span>}
          </p>
          {e.skills.length > 0 && <p className="muted">Skills: {e.skills.join(", ")}</p>}
          {e.bio && <p className="muted">{e.bio}</p>}
          <label className="sr-only" htmlFor={`n-${e.id}`}>
            Review note
          </label>
          <input
            id={`n-${e.id}`}
            placeholder="Review note (optional)"
            value={note[e.id] ?? ""}
            onChange={(x) => setNote({ ...note, [e.id]: x.target.value })}
          />
          <div className="stats" style={{ marginTop: ".5rem" }}>
            {e.status !== "approved" && (
              <button
                className="btn small"
                onClick={() => act(() => api.adminReviewExpert(e.id, "approved", note[e.id]))}
              >
                Approve
              </button>
            )}
            {e.status === "pending" && (
              <button
                className="btn danger small"
                onClick={() => act(() => api.adminReviewExpert(e.id, "rejected", note[e.id]))}
              >
                Reject
              </button>
            )}
            {e.status === "approved" && (
              <button
                className="btn danger small"
                onClick={() => act(() => api.adminReviewExpert(e.id, "suspended", note[e.id]))}
              >
                Suspend (revokes access)
              </button>
            )}
          </div>
        </div>
      ))}
      <h2>Service requests</h2>
      {requests.length === 0 && <p className="muted">No requests yet.</p>}
      {requests.map((r) => (
        <div className="card" key={r.id}>
          <p>
            <span className="badge warn">{r.status}</span>{" "}
            {r.assignedExpertId && (
              <span className="muted">expert: {name(r.assignedExpertId)}</span>
            )}
          </p>
          <p>{r.summary}</p>
          {r.status === "submitted" &&
            (approved.length === 0 ? (
              <p className="muted">Approve an expert to match this request.</p>
            ) : (
              <div className="stats">
                <label className="sr-only" htmlFor={`m-${r.id}`}>
                  Expert to match
                </label>
                <select
                  id={`m-${r.id}`}
                  style={{ width: "auto" }}
                  value={pick[r.id] ?? approved[0]!.id}
                  onChange={(x) => setPick({ ...pick, [r.id]: x.target.value })}
                >
                  {approved.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </select>
                <button
                  className="btn small"
                  onClick={() => act(() => api.adminMatch(r.id, pick[r.id] ?? approved[0]!.id))}
                >
                  Match expert
                </button>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
