"use client";
import { use, useEffect, useState } from "react";
import { calculateProgress, RESCUE_STAGES } from "@buildapps/core";
import { JOURNEY_INFO } from "@/components/Journeys";
import { api, type Project } from "@/lib/api-types";

const ROADMAP = [
  ["Project Rescue Scanner", "Read-only GitHub inspection with evidence-based findings."],
  ["Build Verification Lab", "Automated, sandboxed checks that mark milestones verified."],
  ["Publishing Center", "App Store and Google Play submission help ($25 per app / year)."],
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<Project | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .getProject(id)
      .then(setP)
      .catch((e) => setErr(e.message));
  }, [id]);

  async function act(fn: () => Promise<Project>) {
    setBusy(true);
    setErr(null);
    try {
      setP(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return err ? (
      <div className="err" role="alert">
        {err}
      </div>
    ) : (
      <p className="muted" role="status">
        Loading...
      </p>
    );
  const pr = calculateProgress(p.milestones);
  const completionLabel = {
    incomplete: "In progress",
    user_reported: "Complete (self-reported)",
    verified: "Complete (verified)",
  }[pr.completion];
  const stageIdx = p.recovery ? RESCUE_STAGES.indexOf(p.recovery.stage) : -1;

  return (
    <>
      <span className="badge">
        {JOURNEY_INFO[p.journey].emoji} {JOURNEY_INFO[p.journey].title}
      </span>{" "}
      <span className="badge ok">{p.state.replace("_", " ")}</span>
      <h1 style={{ marginTop: ".4rem" }}>{p.name}</h1>
      {p.repo && (
        <p className="muted">
          Repository: {p.repo.owner}/{p.repo.name} (read-only)
        </p>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div
        className="card"
        style={{ display: "flex", gap: "1.2rem", alignItems: "center", flexWrap: "wrap" }}
      >
        <div className="ring" style={{ "--p": pr.overallPercent } as React.CSSProperties}>
          <span>{pr.overallPercent}%</span>
        </div>
        <div
          className="ring"
          style={{ "--p": pr.verifiedPercent, "--c": "var(--sky)" } as React.CSSProperties}
        >
          <span>{pr.verifiedPercent}%</span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong>{completionLabel}</strong>
          <p className="muted" style={{ margin: ".2rem 0 0" }}>
            Green ring: all completed work. Blue ring: automatically verified work only.
            Self-reported progress is useful, but only verified progress counts as proof.
          </p>
        </div>
      </div>
      {p.recovery && (
        <div className="card">
          <h2>Recovery plan</h2>
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
          {stageIdx < RESCUE_STAGES.length - 1 && (
            <button
              className="btn small"
              disabled={busy}
              onClick={() => act(() => api.advanceRecovery(p.id))}
            >
              Next stage
            </button>
          )}
          <div style={{ marginTop: "1rem" }}>
            {p.recovery.humanHelpRequested ? (
              <span className="badge ok">
                Expert help requested - we&apos;ll match you manually
              </span>
            ) : help === null ? (
              <button className="btn secondary small" onClick={() => setHelp("")}>
                Ask a vetted developer for help
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    const r = await api.requestHumanHelp(p.id, help);
                    setHelp(null);
                    return r;
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
                  Your project is only shared with a matched expert after you approve a scoped
                  handoff.
                </p>
                <button className="btn small" disabled={busy}>
                  Send request
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      <div className="card">
        <h2>Milestones</h2>
        {p.milestones.map((m) => (
          <div className="ms" key={m.id}>
            <span aria-hidden="true">{m.status === "done" ? "✅" : "⬜"}</span>
            <span className="t">
              {m.title} {!m.required && <span className="badge">optional</span>}
            </span>
            {m.completion?.source === "verified" && (
              <span className="badge verified">Verified</span>
            )}
            {m.completion?.source === "user_reported" && (
              <span className="badge warn">Self-reported</span>
            )}
            {m.status !== "done" && p.state === "active" && (
              <button
                className="btn small secondary"
                disabled={busy}
                onClick={() => act(() => api.reportMilestone(p.id, m.id))}
              >
                Mark done
              </button>
            )}
          </div>
        ))}
        {p.state === "draft" && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => act(() => api.setProjectState(p.id, "active"))}
          >
            Start working
          </button>
        )}
      </div>
      <div className="stats">
        {p.state === "active" && (
          <>
            <button
              className="btn secondary small"
              disabled={busy}
              onClick={() => act(() => api.setProjectState(p.id, "needs_help"))}
            >
              I&apos;m stuck
            </button>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => act(() => api.setProjectState(p.id, "completed"))}
            >
              Mark project complete
            </button>
          </>
        )}
        {p.state === "needs_help" && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => act(() => api.setProjectState(p.id, "active"))}
          >
            Back to work
          </button>
        )}
        {p.state !== "archived" && (
          <button
            className="btn secondary small"
            disabled={busy}
            onClick={() => act(() => api.setProjectState(p.id, "archived"))}
          >
            Archive
          </button>
        )}
      </div>
      <h2>Coming next</h2>
      <div className="grid3">
        {ROADMAP.map(([t, d]) => (
          <div className="card" key={t} style={{ opacity: 0.8 }}>
            <strong>{t}</strong>
            <p className="muted" style={{ margin: ".2rem 0 0" }}>
              {d}
            </p>
            <span className="badge">Not available yet</span>
          </div>
        ))}
      </div>
    </>
  );
}
