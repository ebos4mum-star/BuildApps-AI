"use client";
import { useState } from "react";
import { PLATFORM_LABEL, type RequirementCategory } from "@buildapps/publishing";
import { api, type PublishingView } from "@/lib/api-types";
import { ReleaseCard } from "./ReleaseCard";

type TargetV = PublishingView["targets"][number];
type Result = TargetV["readiness"]["results"][number];

const STATUS: Record<Result["status"], { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "verified" },
  self_reported: { label: "Self-reported", cls: "warn" },
  missing: { label: "Missing", cls: "" },
  blocked: { label: "Blocked", cls: "crit" },
  not_applicable: { label: "Not applicable", cls: "ok" },
};
const CATEGORY: Record<RequirementCategory, string> = {
  identity: "App identity",
  build: "Build",
  security: "Security",
  privacy: "Privacy",
  metadata: "Store listing",
  assets: "Assets",
  signing: "Accounts & signing",
  testing: "Testing",
  platform: "Store-specific",
};
const FIELDS = [
  ["appName", "App name (max 30)", "text"],
  ["shortDescription", "Short description (max 80)", "text"],
  ["description", "Description (80+ characters)", "area"],
  ["category", "Category", "text"],
  ["supportUrl", "Support URL (https)", "url"],
  ["privacyPolicyUrl", "Privacy policy URL (https)", "url"],
  ["marketingUrl", "Marketing URL (https, optional)", "url"],
] as const;
const PLATFORM_FIELD = {
  apple_app_store: ["bundleId", "Bundle identifier (com.example.app)"],
  google_play: ["packageName", "Application ID (com.example.app)"],
  web: ["siteUrl", "Production site address (https)"],
} as const;

export function TargetCard({
  v,
  projectId,
  act,
  busy,
}: {
  v: TargetV;
  projectId: string;
  act: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
  busy: boolean;
}) {
  const t = v.target;
  const r = v.readiness;
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(t.metadata).map(([k, x]) => [
        k,
        typeof x === "boolean" ? String(x) : String(x ?? ""),
      ]),
    ),
  );
  const [claim, setClaim] = useState<{
    key: string;
    kind: "self_reported" | "not_applicable";
    note: string;
  } | null>(null);
  const [rel, setRel] = useState({ version: "", build: "", notes: "" });
  const [pf, pfLabel] = PLATFORM_FIELD[t.platform];
  const grouped: [string, Result[]][] = [];
  for (const res of r.results) {
    const hit = grouped.find(([cat]) => cat === res.category);
    if (hit) hit[1].push(res);
    else grouped.push([res.category, [res]]);
  }

  function metadataPayload() {
    const out: Record<string, string | boolean> = {};
    for (const [k, val] of Object.entries(form)) {
      if (val === "") continue;
      out[k] = k === "hasLogin" || k === "collectsUserData" ? val === "true" : val;
    }
    return out;
  }

  return (
    <details className="card" open data-testid={`target-${t.platform}`}>
      <summary>
        <strong>{PLATFORM_LABEL[t.platform]}</strong>{" "}
        {r.readyToSubmit ? (
          <span className="badge ok">Ready to submit</span>
        ) : (
          <span className="badge warn">Not ready yet</span>
        )}{" "}
        <span className="muted">
          {r.requiredVerified} verified - {r.requiredSelfReported} self-reported -{" "}
          {r.counts.missing} missing - {r.counts.blocked} blocked
        </span>
      </summary>
      <p className="muted">{v.integration.note}</p>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        {r.disclaimer}
      </p>
      {r.blockers.length > 0 && (
        <div className="err" role="alert">
          <strong>Blocked by evidence</strong>
          <ul>
            {r.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Listing details</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            () => api.publishing.saveMetadata(t.id, metadataPayload()),
            "Listing details saved.",
          );
        }}
      >
        {FIELDS.map(([k, label, kind]) => (
          <div key={k}>
            <label className="field" htmlFor={`${t.id}-${k}`}>
              {label}
            </label>
            {kind === "area" ? (
              <textarea
                id={`${t.id}-${k}`}
                rows={3}
                maxLength={4000}
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            ) : (
              <input
                id={`${t.id}-${k}`}
                type={kind === "url" ? "url" : "text"}
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            )}
          </div>
        ))}
        <label className="field" htmlFor={`${t.id}-${pf}`}>
          {pfLabel}
        </label>
        <input
          id={`${t.id}-${pf}`}
          value={form[pf] ?? ""}
          onChange={(e) => setForm({ ...form, [pf]: e.target.value })}
        />
        <label className="field" htmlFor={`${t.id}-hasLogin`}>
          Does the app have a login?
        </label>
        <select
          id={`${t.id}-hasLogin`}
          value={form.hasLogin ?? ""}
          onChange={(e) => setForm({ ...form, hasLogin: e.target.value })}
        >
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <label className="field" htmlFor={`${t.id}-collects`}>
          Does the app collect user data?
        </label>
        <select
          id={`${t.id}-collects`}
          value={form.collectsUserData ?? ""}
          onChange={(e) => setForm({ ...form, collectsUserData: e.target.value })}
        >
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        <label className="field" htmlFor={`${t.id}-notes`}>
          Notes for reviewers (never put passwords here)
        </label>
        <textarea
          id={`${t.id}-notes`}
          rows={2}
          maxLength={2000}
          value={form.reviewNotes ?? ""}
          onChange={(e) => setForm({ ...form, reviewNotes: e.target.value })}
        />
        <p>
          <button className="btn small" disabled={busy}>
            Save listing details
          </button>
        </p>
      </form>

      <h3>Requirements</h3>
      {grouped.map(([cat, items]) => (
        <div key={cat}>
          <h4 style={{ margin: ".8rem 0 .2rem", color: "var(--sky)" }}>
            {CATEGORY[cat as RequirementCategory]}
          </h4>
          {items.map((x) => {
            const cl = claim?.key === x.key ? claim : null;
            return (
              <div
                className="ms"
                key={x.key}
                style={{ alignItems: "flex-start", flexWrap: "wrap" }}
                data-testid={`req-${x.key}`}
              >
                <span className="t">
                  {x.title}{" "}
                  {x.level === "recommended" && <span className="badge">recommended</span>}
                  <div className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>
                    {x.reason}
                  </div>
                  {x.status === "missing" && (
                    <div className="muted" style={{ fontWeight: 400, fontSize: ".8rem" }}>
                      {x.help}
                    </div>
                  )}
                </span>
                <span className={`badge ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>
                {x.claimable &&
                  x.source !== "system_evidence" &&
                  x.status !== "not_applicable" &&
                  x.source !== "metadata" &&
                  (x.status === "self_reported" ? (
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={() => act(() => api.publishing.removeClaim(t.id, x.key))}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      className="btn small secondary"
                      disabled={busy}
                      onClick={() => setClaim({ key: x.key, kind: "self_reported", note: "" })}
                    >
                      I&apos;ve done this
                    </button>
                  ))}
                {x.canBeNotApplicable && x.status === "missing" && (
                  <button
                    className="btn small secondary"
                    disabled={busy}
                    onClick={() => setClaim({ key: x.key, kind: "not_applicable", note: "" })}
                  >
                    Not applicable
                  </button>
                )}
                {x.status === "not_applicable" && x.source === "user_claim" && (
                  <button
                    className="btn secondary small"
                    disabled={busy}
                    onClick={() => act(() => api.publishing.removeClaim(t.id, x.key))}
                  >
                    Undo
                  </button>
                )}
                {cl && (
                  <form
                    style={{ width: "100%" }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await api.publishing.claim(t.id, cl.key, cl.kind, cl.note);
                        setClaim(null);
                      });
                    }}
                  >
                    <label className="field" htmlFor={`cl-${x.key}`}>
                      {cl.kind === "self_reported"
                        ? "What did you do? (kept as your claim - not verified)"
                        : "Why does this not apply?"}
                    </label>
                    <input
                      id={`cl-${x.key}`}
                      required
                      minLength={5}
                      maxLength={500}
                      value={cl.note}
                      onChange={(e) => setClaim({ ...cl, note: e.target.value })}
                    />
                    <p>
                      <button className="btn small" disabled={busy}>
                        Save
                      </button>{" "}
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setClaim(null)}
                      >
                        Cancel
                      </button>
                    </p>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <h3>Releases</h3>
      {v.releases.length === 0 && (
        <p className="muted">No releases yet. Create one to track a version through submission.</p>
      )}
      {v.releases.map((rv) => (
        <ReleaseCard key={rv.release.id} v={rv} act={act} busy={busy} />
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await api.publishing.createRelease(
              t.id,
              rel.version,
              rel.build || undefined,
              rel.notes || undefined,
            );
            setRel({ version: "", build: "", notes: "" });
          }, "Release created.");
        }}
      >
        <label className="field" htmlFor={`${t.id}-ver`}>
          New release version
        </label>
        <input
          id={`${t.id}-ver`}
          required
          value={rel.version}
          placeholder="1.0.0"
          onChange={(e) => setRel({ ...rel, version: e.target.value })}
        />
        <label className="field" htmlFor={`${t.id}-build`}>
          Build number (optional)
        </label>
        <input
          id={`${t.id}-build`}
          value={rel.build}
          maxLength={20}
          onChange={(e) => setRel({ ...rel, build: e.target.value })}
        />
        <label className="field" htmlFor={`${t.id}-rn`}>
          Release notes (optional)
        </label>
        <textarea
          id={`${t.id}-rn`}
          rows={2}
          maxLength={2000}
          value={rel.notes}
          onChange={(e) => setRel({ ...rel, notes: e.target.value })}
        />
        <p>
          <button className="btn small" disabled={busy}>
            Create release
          </button>
        </p>
      </form>
      <input type="hidden" value={projectId} readOnly />
    </details>
  );
}
