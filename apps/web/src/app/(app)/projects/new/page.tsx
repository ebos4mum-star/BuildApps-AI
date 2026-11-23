"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { JOURNEY_INFO, type JourneyKey } from "@/components/Journeys";
import { api, type ProjectIntake } from "@/lib/api-types";

function NewProject() {
  const router = useRouter();
  const q = useSearchParams();
  const journey = (q.get("journey") as JourneyKey | null) ?? null;
  const onboarding = q.get("onboarding") === "1";
  const [f, setF] = useState({
    name: "",
    idea: "",
    platform: "web",
    description: "",
    repoUrl: "",
    problem: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  if (!journey || !(journey in JOURNEY_INFO)) {
    return (
      <>
        <h1>New project</h1>
        <div className="grid3">
          {(Object.keys(JOURNEY_INFO) as JourneyKey[]).map((k) => (
            <Link key={k} href={`/projects/new?journey=${k}`} className="jcard">
              <div className="emoji" aria-hidden="true">
                {JOURNEY_INFO[k].emoji}
              </div>
              <h3>{JOURNEY_INFO[k].title}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {JOURNEY_INFO[k].blurb}
              </p>
            </Link>
          ))}
        </div>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const intake: ProjectIntake =
        journey === "start"
          ? { journey, name: f.name, idea: f.idea, platform: f.platform as "web" }
          : journey === "continue"
            ? {
                journey,
                name: f.name,
                description: f.description,
                ...(f.repoUrl ? { repoUrl: f.repoUrl } : {}),
              }
            : { journey: "rescue", name: f.name, repoUrl: f.repoUrl, problem: f.problem };
      const p = await api.createProject(intake);
      await api.setProjectState(p.id, "active");
      router.replace(onboarding ? "/learn" : `/projects/${p.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create project");
      setBusy(false);
    }
  }

  const info = JOURNEY_INFO[journey];
  return (
    <form onSubmit={submit} className="card">
      <h1>
        {info.emoji} {info.title}
      </h1>
      <label className="field" htmlFor="name">
        Project name
      </label>
      <input id="name" required maxLength={100} value={f.name} onChange={set("name")} />
      {journey === "start" && (
        <>
          <label className="field" htmlFor="idea">
            What do you want to build?
          </label>
          <textarea
            id="idea"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={f.idea}
            onChange={set("idea")}
            placeholder="A habit tracker where friends can cheer each other on..."
          />
          <label className="field" htmlFor="platform">
            Platform
          </label>
          <select id="platform" value={f.platform} onChange={set("platform")}>
            <option value="web">Website</option>
            <option value="ios">iPhone app</option>
            <option value="android">Android app</option>
            <option value="cross_platform">iPhone + Android</option>
          </select>
        </>
      )}
      {journey === "continue" && (
        <>
          <label className="field" htmlFor="desc">
            Where are you now?
          </label>
          <textarea
            id="desc"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={f.description}
            onChange={set("description")}
            placeholder="Login and the home screen work; saving data doesn't."
          />
          <label className="field" htmlFor="repo">
            GitHub repository URL (optional)
          </label>
          <input
            id="repo"
            type="url"
            value={f.repoUrl}
            onChange={set("repoUrl")}
            placeholder="https://github.com/you/project"
          />
        </>
      )}
      {journey === "rescue" && (
        <>
          <label className="field" htmlFor="repo">
            GitHub repository URL
          </label>
          <input
            id="repo"
            type="url"
            required
            value={f.repoUrl}
            onChange={set("repoUrl")}
            placeholder="https://github.com/you/project"
          />
          <p className="muted">
            We only ever ask for read-only access, and nothing is run without sandboxing.
          </p>
          <label className="field" htmlFor="problem">
            What went wrong?
          </label>
          <textarea
            id="problem"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={f.problem}
            onChange={set("problem")}
            placeholder="The build fails after the AI rewrote my auth code."
          />
        </>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <p>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create project"}
        </button>
      </p>
    </form>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading...</p>}>
      <NewProject />
    </Suspense>
  );
}
