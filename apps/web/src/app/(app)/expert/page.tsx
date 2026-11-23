"use client";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ExpertRequestDetail,
  type ExpertRow,
  type ExpertWorkspaceView,
  type ServiceRequestRow,
} from "@/lib/api-types";

const STATUS: Record<string, string> = {
  matched: "New match - review and accept",
  in_progress: "In progress",
  delivered: "Delivered - awaiting owner review",
  completed: "Completed",
  submitted: "Returned to pool",
  cancelled: "Cancelled",
};

export default function ExpertPage() {
  const [profile, setProfile] = useState<ExpertRow | null | undefined>(undefined);
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: "", headline: "", bio: "", skills: "" });
  const load = useCallback(async () => {
    const p = await api.expertProfile();
    setProfile(p);
    if (p) {
      setForm({
        displayName: p.displayName,
        headline: p.headline ?? "",
        bio: p.bio ?? "",
        skills: p.skills.join(", "),
      });
      if (p.status === "approved") setRequests(await api.expertRequests());
    }
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.saveExpertProfile({
        displayName: form.displayName,
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        skills: form.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await load();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  }
  if (profile === undefined)
    return err ? (
      <div className="err" role="alert">
        {err}
      </div>
    ) : (
      <p className="muted" role="status">
        Loading...
      </p>
    );

  return (
    <>
      <h1>Expert workspace</h1>
      <p className="muted">
        Vetted developers help people finish stuck projects. Applications are reviewed by an
        administrator before you can be matched.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <form className="card" onSubmit={save}>
        <h2>
          {profile ? "Your expert profile" : "Apply to become an expert"}{" "}
          {profile && (
            <span
              className={`badge ${profile.status === "approved" ? "ok" : profile.status === "pending" ? "warn" : "crit"}`}
            >
              {profile.status}
            </span>
          )}
        </h2>
        {profile?.reviewNote && <p className="muted">Reviewer note: {profile.reviewNote}</p>}
        <label className="field" htmlFor="dn">
          Display name
        </label>
        <input
          id="dn"
          required
          maxLength={80}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <label className="field" htmlFor="hl">
          Headline
        </label>
        <input
          id="hl"
          maxLength={120}
          value={form.headline}
          onChange={(e) => setForm({ ...form, headline: e.target.value })}
          placeholder="Full-stack rescue for AI-built Next.js apps"
        />
        <label className="field" htmlFor="sk">
          Skills (comma separated)
        </label>
        <input
          id="sk"
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
          placeholder="next.js, supabase, react native"
        />
        <label className="field" htmlFor="bio">
          Experience
        </label>
        <textarea
          id="bio"
          rows={4}
          maxLength={2000}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
        <p>
          <button className="btn small">{profile ? "Update profile" : "Submit application"}</button>
        </p>
      </form>

      {profile?.status === "approved" && (
        <>
          <h2>Your jobs</h2>
          {requests.length === 0 && <p className="muted">No jobs matched to you yet.</p>}
          {requests.map((r) => (
            <div className="card" key={r.id}>
              <p>
                <span className="badge warn">{STATUS[r.status] ?? r.status}</span>
              </p>
              <p>{r.summary}</p>
              <button
                className="btn secondary small"
                onClick={() => setOpen(open === r.id ? null : r.id)}
              >
                {open === r.id ? "Close" : "Open job"}
              </button>
              {open === r.id && <JobView id={r.id} onChange={load} />}
            </div>
          ))}
        </>
      )}
    </>
  );
}

function JobView({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [d, setD] = useState<ExpertRequestDetail | null>(null);
  const [w, setW] = useState<ExpertWorkspaceView | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sub, setSub] = useState<{ job: string; note: string; url: string } | null>(null);
  const load = useCallback(async () => {
    const detail = await api.expertRequest(id);
    setD(detail);
    api
      .expertWorkspace(id)
      .then((x) => {
        setW(x);
        setWErr(null);
      })
      .catch((e) => {
        setW(null);
        setWErr(e.message);
      });
  }, [id]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await load();
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  if (!d) return <p className="muted">Loading...</p>;
  const st = d.request.status;
  return (
    <div className="subcard">
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div className="stats">
        {st === "matched" && (
          <>
            <button className="btn small" onClick={() => act(() => api.expertAct(id, "accept"))}>
              Accept job
            </button>
            <button
              className="btn secondary small"
              onClick={() => act(() => api.expertAct(id, "decline"))}
            >
              Decline
            </button>
          </>
        )}
        {st === "in_progress" && (
          <button className="btn small" onClick={() => act(() => api.expertAct(id, "deliver"))}>
            Mark delivered
          </button>
        )}
      </div>

      <h3>Project access</h3>
      {w ? (
        <>
          <p className="muted">
            Granted by the owner until {new Date(w.handoff.expiresAt).toLocaleString()}:{" "}
            {w.handoff.scopes.join(", ")}. You see summaries only - never source code or
            credentials.
          </p>
          {w.project && (
            <p>
              <strong>{w.project.name}</strong> ({w.project.journey}, {w.project.state})
              {w.project.repo ? ` - ${w.project.repo}` : ""}
            </p>
          )}
          {w.scan?.assessment && <p>{w.scan.assessment.headline}</p>}
          {w.findings && (
            <ol className="findings">
              {w.findings
                .filter((f) => f.status !== "resolved")
                .map((f) => (
                  <li className="finding" key={f.id}>
                    <span className="badge">{f.severity}</span>{" "}
                    <span className="badge">{f.kind.replace("_", " ")}</span>{" "}
                    <strong>{f.title}</strong>
                    <div className="muted">{f.remedy}</div>
                    {f.evidence.slice(0, 2).map((e, i) => (
                      <div key={i}>
                        <code>
                          {e.path}
                          {e.line ? `:${e.line}` : ""}
                        </code>
                        {e.snippet ? (
                          <>
                            {" "}
                            <code>{e.snippet}</code>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </li>
                ))}
            </ol>
          )}
          {w.verification && (
            <ul className="checks">
              {w.verification.checks.map((c) => (
                <li key={c.id}>
                  {c.title}: <strong>{c.status}</strong>
                </li>
              ))}
            </ul>
          )}
          {w.publishing && (
            <div data-testid="expert-publishing">
              <h3>Publishing readiness</h3>
              {w.publishing.targets.length === 0 && (
                <p className="muted">No publishing targets yet.</p>
              )}
              {w.publishing.targets.map((t) => (
                <div className="subcard" key={t.target.id}>
                  <strong>{t.target.platform.replace(/_/g, " ")}</strong>{" "}
                  <span className={`badge ${t.readiness.readyToSubmit ? "ok" : "warn"}`}>
                    {t.readiness.readyToSubmit ? "ready to submit" : "not ready"}
                  </span>
                  <div className="muted">
                    {t.readiness.requiredVerified} verified - {t.readiness.requiredSelfReported}{" "}
                    self-reported - {t.readiness.counts.missing} missing -{" "}
                    {t.readiness.counts.blocked} blocked
                  </div>
                  <ul className="checks">
                    {t.readiness.results
                      .filter((r) => r.status === "missing" || r.status === "blocked")
                      .map((r) => (
                        <li key={r.key}>
                          {r.title}: <strong>{r.status}</strong>{" "}
                          <span className="muted">{r.reason}</span>
                        </li>
                      ))}
                  </ul>
                  {t.releases.map((rv) => (
                    <div key={rv.release.id} className="muted">
                      v{rv.release.version}: {rv.release.status.replace("_", " ")} (reported by the
                      owner)
                      {rv.actions.filter((a) => a.status !== "done").length > 0 &&
                        ` - ${rv.actions.filter((a) => a.status !== "done").length} open task(s)`}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted">{wErr ?? "No access granted."}</p>
      )}

      <h3>Job milestones</h3>
      {d.jobs.map((j) => (
        <div className="ms" key={j.id} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <span className="t">
            {j.title}
            {j.decisionNote && (
              <div className="muted" style={{ fontWeight: 400 }}>
                Owner feedback: {j.decisionNote}
              </div>
            )}
          </span>
          <span
            className={`badge ${j.status === "accepted" ? "ok" : j.status === "rejected" ? "crit" : ""}`}
          >
            {j.status}
          </span>
          {st === "in_progress" && (j.status === "todo" || j.status === "rejected") && (
            <button
              className="btn small secondary"
              onClick={() => setSub({ job: j.id, note: "", url: "" })}
            >
              Submit work
            </button>
          )}
          {sub?.job === j.id && (
            <form
              style={{ width: "100%" }}
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await api.expertSubmitJob(id, j.id, sub.note, sub.url || undefined);
                  setSub(null);
                });
              }}
            >
              <label className="field" htmlFor={`sn-${j.id}`}>
                What did you do?
              </label>
              <textarea
                id={`sn-${j.id}`}
                required
                minLength={5}
                rows={2}
                value={sub.note}
                onChange={(e) => setSub({ ...sub, note: e.target.value })}
              />
              <label className="field" htmlFor={`su-${j.id}`}>
                Link to the work (https, optional)
              </label>
              <input
                id={`su-${j.id}`}
                type="url"
                value={sub.url}
                onChange={(e) => setSub({ ...sub, url: e.target.value })}
              />
              <p>
                <button className="btn small">Submit for owner review</button>
              </p>
            </form>
          )}
        </div>
      ))}
      {(st === "matched" || st === "in_progress") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.expertAddJob(id, title);
              setTitle("");
            });
          }}
        >
          <label className="field" htmlFor="jt">
            Add a milestone
          </label>
          <input
            id="jt"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Remove committed secrets and rotate keys"
          />
          <p>
            <button className="btn small secondary">Add milestone</button>
          </p>
        </form>
      )}
    </div>
  );
}
