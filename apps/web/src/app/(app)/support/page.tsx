"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-types";
import type {
  NotificationRow,
  ReportReason,
  ReportTarget,
  SupportCategory,
  SupportRow,
} from "@buildapps/api-client";
import Link from "next/link";

const CATEGORIES: SupportCategory[] = [
  "account",
  "learning",
  "project",
  "expert",
  "publishing",
  "other",
];
const REASONS: ReportReason[] = [
  "spam",
  "harassment",
  "unsafe_content",
  "impersonation",
  "fraud",
  "other",
];
const TARGETS: ReportTarget[] = ["user", "expert", "project", "request"];

export default function SupportPage() {
  const [mine, setMine] = useState<SupportRow[] | null>(null);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "other" as SupportCategory, subject: "", body: "" });
  const [rep, setRep] = useState({
    targetType: "expert" as ReportTarget,
    targetId: "",
    reason: "spam" as ReportReason,
    detail: "",
  });
  const load = useCallback(async () => {
    const [s, n] = await Promise.all([api.mySupport(), api.notifications()]);
    setMine(s);
    setNotes(n);
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
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <h1>Help &amp; notifications</h1>
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

      <h2>Notifications</h2>
      {notes.length === 0 ? (
        <p className="muted">Nothing new. We will tell you here when something changes.</p>
      ) : (
        <>
          <ul className="checks" data-testid="notifications">
            {notes.map((n) => (
              <li key={n.id}>
                {!n.readAt && <span className="badge warn">new</span>}{" "}
                {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}{" "}
                {n.body && <span className="muted">{n.body}</span>}
              </li>
            ))}
          </ul>
          {notes.some((n) => !n.readAt) && (
            <button
              className="btn secondary small"
              onClick={() => run(() => api.markNotificationsRead("all"), "Marked as read.")}
            >
              Mark all as read
            </button>
          )}
        </>
      )}

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.createSupport(form);
            setForm({ ...form, subject: "", body: "" });
          }, "Thanks - your request was sent. We will reply here.");
        }}
      >
        <h2>Contact support</h2>
        <label className="field" htmlFor="sc">
          What is it about?
        </label>
        <select
          id="sc"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as SupportCategory })}
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="field" htmlFor="ss">
          Subject
        </label>
        <input
          id="ss"
          required
          minLength={3}
          maxLength={120}
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <label className="field" htmlFor="sb">
          Details
        </label>
        <textarea
          id="sb"
          required
          minLength={10}
          maxLength={4000}
          rows={4}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <p className="muted">Never include passwords or secret keys.</p>
        <p>
          <button className="btn small">Send</button>
        </p>
      </form>

      <h2>Your requests</h2>
      {mine?.length === 0 && <p className="muted">No requests yet.</p>}
      {mine?.map((r) => (
        <div className="card" key={r.id}>
          <p>
            <span className="badge warn">{r.status.replace("_", " ")}</span>{" "}
            <strong>{r.subject}</strong>
          </p>
          {r.adminNote && <p className="muted">Reply: {r.adminNote}</p>}
        </div>
      ))}

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.reportAbuse({
              targetType: rep.targetType,
              targetId: rep.targetId,
              reason: rep.reason,
              ...(rep.detail ? { detail: rep.detail } : {}),
            });
            setRep({ ...rep, targetId: "", detail: "" });
          }, "Report received. An administrator will review it.");
        }}
      >
        <h2>Report abuse</h2>
        <label className="field" htmlFor="rt">
          What are you reporting?
        </label>
        <select
          id="rt"
          value={rep.targetType}
          onChange={(e) => setRep({ ...rep, targetType: e.target.value as ReportTarget })}
        >
          {TARGETS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="field" htmlFor="ri">
          Its id (from the page address or message)
        </label>
        <input
          id="ri"
          required
          maxLength={128}
          value={rep.targetId}
          onChange={(e) => setRep({ ...rep, targetId: e.target.value })}
        />
        <label className="field" htmlFor="rr">
          Reason
        </label>
        <select
          id="rr"
          value={rep.reason}
          onChange={(e) => setRep({ ...rep, reason: e.target.value as ReportReason })}
        >
          {REASONS.map((c) => (
            <option key={c} value={c}>
              {c.replace("_", " ")}
            </option>
          ))}
        </select>
        <label className="field" htmlFor="rd">
          Details (optional)
        </label>
        <textarea
          id="rd"
          rows={3}
          maxLength={2000}
          value={rep.detail}
          onChange={(e) => setRep({ ...rep, detail: e.target.value })}
        />
        <p>
          <button className="btn danger small">Submit report</button>
        </p>
      </form>
    </>
  );
}
