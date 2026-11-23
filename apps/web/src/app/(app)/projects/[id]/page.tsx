"use client";
import { use, useCallback, useEffect, useState } from "react";
import { JOURNEY_INFO } from "@/components/Journeys";
import { FindingsPanel } from "@/components/workspace/FindingsPanel";
import { GithubCard } from "@/components/workspace/GithubCard";
import { HelpPanel } from "@/components/workspace/HelpPanel";
import { PublishingPanel } from "@/components/publishing/PublishingPanel";
import { VerificationPanel } from "@/components/workspace/VerificationPanel";
import { api, type WorkspaceView } from "@/lib/api-types";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ws, setWs] = useState<WorkspaceView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setWs(await api.workspace(id));
  }, [id]);
  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, [reload]);

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
  if (!ws)
    return err ? (
      <div className="err" role="alert">
        {err}
      </div>
    ) : (
      <p className="muted" role="status">
        Loading...
      </p>
    );
  const p = ws.project;
  const pr = ws.progress;
  const completionLabel = {
    incomplete: "In progress",
    user_reported: "Complete (self-reported)",
    verified: "Complete (verified)",
  }[pr.completion];

  return (
    <>
      <span className="badge">
        {JOURNEY_INFO[p.journey].emoji} {JOURNEY_INFO[p.journey].title}
      </span>{" "}
      <span className="badge ok">{p.state.replace("_", " ")}</span>
      <h1 style={{ marginTop: ".4rem" }}>{p.name}</h1>
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
      <GithubCard ws={ws} reload={reload} />
      <div className="card">
        <h2>Milestones</h2>
        {p.milestones.map((m) => (
          <div className="ms" key={m.id}>
            <span aria-hidden="true">{m.status === "done" ? "✅" : "⬜"}</span>
            <span className="t">
              {m.title} {!m.required && <span className="badge">optional</span>}
              {m.completion?.evidenceRef && (
                <div className="muted" style={{ fontWeight: 400, fontSize: ".8rem" }}>
                  Evidence:{" "}
                  {m.completion.evidenceRef.startsWith("scan:")
                    ? "repository scan"
                    : "verification run"}{" "}
                  (
                  {m.completion.evidenceRef.slice(
                    m.completion.evidenceRef.indexOf(":") + 1,
                    m.completion.evidenceRef.indexOf(":") + 9,
                  )}
                  )
                </div>
              )}
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
      <FindingsPanel
        ws={ws}
        reload={reload}
        onAskExpert={(t) => {
          setDraft(t);
          document.getElementById("expert-help")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
      <VerificationPanel ws={ws} />
      <HelpPanel ws={ws} reload={reload} draft={draft} onDraftUsed={() => setDraft(null)} />
      <PublishingPanel projectId={p.id} />
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
    </>
  );
}
