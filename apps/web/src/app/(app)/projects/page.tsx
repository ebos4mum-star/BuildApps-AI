"use client";
import Link from "next/link";
import { EmptyState } from "@/components/Illustration";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { calculateProgress } from "@buildapps/core";
import { JOURNEY_INFO } from "@/components/Journeys";
import { api, type Project } from "@/lib/api-types";

function GithubBanner() {
  const q = useSearchParams();
  const r = q.get("github");
  if (!r) return null;
  if (r === "connected")
    return (
      <p role="status" className="badge ok" style={{ whiteSpace: "normal" }}>
        GitHub connected (read-only). Open a project to choose a repository.
      </p>
    );
  if (r === "pending")
    return (
      <p role="status" className="badge warn" style={{ whiteSpace: "normal" }}>
        Your GitHub organisation owner needs to approve the app. Try again afterwards.
      </p>
    );
  return (
    <div className="err" role="alert">
      {q.get("reason") ?? "Could not connect GitHub."}
    </div>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setErr(e.message));
  }, []);
  if (err)
    return (
      <div className="err" role="alert">
        {err}
      </div>
    );
  if (!projects)
    return (
      <p className="muted" role="status">
        Loading projects...
      </p>
    );
  return (
    <>
      <Suspense fallback={null}>
        <GithubBanner />
      </Suspense>
      <div className="stats" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Your projects</h1>
        <Link href="/projects/new" className="btn small">
          New project
        </Link>
      </div>
      {projects.length === 0 && (
        <div className="card">
          <EmptyState scene="empty-projects" title="No projects yet">
            Start one, continue one you already have, or rescue one that is stuck.
          </EmptyState>
          <Link href="/projects/new" className="btn">
            Create a project
          </Link>
        </div>
      )}
      {projects.map((p) => {
        const pr = calculateProgress(p.milestones);
        return (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="jcard"
            style={{ marginBottom: ".8rem" }}
          >
            <span className="badge">
              {JOURNEY_INFO[p.journey].emoji} {p.journey}
            </span>{" "}
            <span className="badge">{p.state.replace("_", " ")}</span>
            <h3 style={{ marginTop: ".4rem" }}>{p.name}</h3>
            <div
              className="bar"
              role="progressbar"
              aria-label={`${p.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pr.overallPercent}
            >
              <i style={{ width: `${pr.overallPercent}%` }} />
            </div>
            <small className="muted">
              {pr.overallPercent}% done - {pr.verifiedPercent}% verified
            </small>
          </Link>
        );
      })}
    </>
  );
}
