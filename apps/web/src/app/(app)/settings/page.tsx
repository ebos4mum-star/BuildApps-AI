"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@buildapps/core";
import type { NotificationPrefs } from "@buildapps/api-client";
import { PrivacyCard } from "@/components/PrivacyCard";
import { api } from "@/lib/api-types";

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  learning_reminder: "Practice reminders",
  weekly_summary: "Weekly summary",
  project: "Project updates (scans, milestones)",
  support: "Support replies",
  expert: "Expert help updates",
  publishing: "Publishing updates",
  security: "Account and security (always on)",
};

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      "timeZone",
    );
  } catch {
    return ["UTC"];
  }
}

export default function Settings() {
  const [name, setName] = useState("");
  const [tz, setTz] = useState("UTC");
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [providers, setProviders] = useState<{ push: string | null; email: string | null } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const v = await api.account();
    setName(v.account.displayName ?? "");
    setTz(v.account.timeZone);
    setPrefs(v.notifications);
    setProviders(v.providers);
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  async function run(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  const quiet = prefs?.quietHours;
  return (
    <>
      <h1>Settings</h1>
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

      <section className="card" aria-labelledby="profile-h">
        <h2 id="profile-h">Profile</h2>
        <label htmlFor="acct-name">Display name</label>
        <input
          id="acct-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="How you appear to experts and admins"
        />
        <label htmlFor="acct-tz">Time zone (used for streaks, goals and reminders)</label>
        <select id="acct-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
          {[...new Set([tz, ...zones()])].map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          onClick={() =>
            run(
              () => api.updateAccount({ displayName: name.trim() || null, timeZone: tz }),
              "Profile saved.",
            )
          }
        >
          Save profile
        </button>
        <p style={{ marginTop: ".8rem" }}>
          <Link className="btn secondary small" href="/onboarding?edit=1">
            Edit my learning plan
          </Link>
        </p>
      </section>

      {prefs && (
        <section className="card" aria-labelledby="notif-h" data-testid="notification-prefs">
          <h2 id="notif-h">Notifications</h2>
          <p className="muted">
            In-app notifications are always on. Push and email are optional and stay off until you
            choose.
            {providers && !providers.push && !providers.email
              ? " Push and email delivery are not enabled on this server yet, so choices here take effect once they are."
              : ""}
          </p>
          <label style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={prefs.push}
              onChange={(e) => setPrefs({ ...prefs, push: e.target.checked })}
            />
            Push notifications
          </label>
          <label style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={prefs.email}
              onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
            />
            Email
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: ".6rem 0" }}>
            <legend className="muted">What to hear about</legend>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <label key={c} style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={prefs.categories[c]}
                  disabled={c === "security"}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      categories: { ...prefs.categories, [c]: e.target.checked },
                    })
                  }
                />
                {CATEGORY_LABEL[c]}
              </label>
            ))}
          </fieldset>
          <label style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!quiet}
              onChange={(e) =>
                setPrefs({ ...prefs, quietHours: e.target.checked ? { start: 22, end: 7 } : null })
              }
            />
            Quiet hours (no push messages)
          </label>
          {quiet && (
            <div className="stats">
              <label htmlFor="q-start">From</label>
              <select
                id="q-start"
                value={quiet.start}
                style={{ width: "auto" }}
                onChange={(e) =>
                  setPrefs({ ...prefs, quietHours: { ...quiet, start: Number(e.target.value) } })
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </select>
              <label htmlFor="q-end">to</label>
              <select
                id="q-end"
                value={quiet.end}
                style={{ width: "auto" }}
                onChange={(e) =>
                  setPrefs({ ...prefs, quietHours: { ...quiet, end: Number(e.target.value) } })
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </select>
            </div>
          )}
          <button
            className="btn small"
            onClick={() =>
              run(() => api.saveNotificationPrefs(prefs), "Notification preferences saved.")
            }
          >
            Save notification preferences
          </button>
        </section>
      )}

      <PrivacyCard />
    </>
  );
}
