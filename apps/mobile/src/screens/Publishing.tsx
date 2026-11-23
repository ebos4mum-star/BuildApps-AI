import { useCallback, useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import {
  ACTION_STATUSES,
  PLATFORM_LABEL,
  REASON_CATEGORIES,
  REVIEW_OUTCOMES,
  type ActionStatus,
  type Platform,
  type ReasonCategory,
  type ReviewOutcome,
} from "@buildapps/publishing";
import type { PublishingView } from "@buildapps/api-client";
import { Badge, Button, Card, s } from "../components/ui";
import { Section } from "../components/Section";
import { api } from "../lib/session";
import { c } from "../theme";
import { RequestBlock, type Act } from "./RequestBlock";

type TargetV = PublishingView["targets"][number];
type ReleaseV = TargetV["releases"][number];
const STATUS = {
  verified: { label: "Verified", tone: "verified" },
  self_reported: { label: "Self-reported", tone: "warn" },
  missing: { label: "Missing", tone: "muted" },
  blocked: { label: "Blocked", tone: "warn" },
  not_applicable: { label: "Not applicable", tone: "ok" },
} as const;
const RELEASE_TEXT: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to submit",
  submitted: "Submitted (reported by you)",
  in_review: "In review (reported by you)",
  rejected: "Rejected (reported by you)",
  approved: "Approved (reported by you - not checked with the store)",
  released: "Released (reported by you)",
  withdrawn: "Withdrawn",
};
const REASON_LABEL: Record<string, string> = {
  metadata: "Listing",
  privacy: "Privacy",
  crash_or_bug: "Crash/bug",
  guideline: "Guideline",
  security: "Security",
  legal: "Legal",
  performance: "Performance",
  other: "Other",
};
const FIELDS: [string, string, boolean][] = [
  ["appName", "App name (max 30)", false],
  ["shortDescription", "Short description (max 80)", false],
  ["description", "Description (80+ characters)", true],
  ["category", "Category", false],
  ["supportUrl", "Support URL (https)", false],
  ["privacyPolicyUrl", "Privacy policy URL (https)", false],
];
const PLATFORM_FIELD = {
  apple_app_store: ["bundleId", "Bundle identifier"],
  google_play: ["packageName", "Application ID"],
  web: ["siteUrl", "Production site (https)"],
} as const;

/** Touch-first owner workflow for the Publishing Center. Same backend and records as the web app. */
export function PublishingSection({ projectId }: { projectId: string }) {
  const [view, setView] = useState<PublishingView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assist, setAssist] = useState<string | null>(null);
  const load = useCallback(async () => setView(await api.publishing.view(projectId)), [projectId]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  const act: Act = async (fn, done) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      if (done) setMsg(done(r));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  if (!view)
    return (
      <Section title="Publishing Center">
        <Text style={s.muted}>{err ?? "Loading..."}</Text>
      </Section>
    );
  const help = view.helpRequest;
  const closed = help ? ["completed", "cancelled"].includes(help.status) : false;
  return (
    <Section
      title="Publishing Center"
      badge={
        view.targets.length
          ? `${view.targets.length} target${view.targets.length > 1 ? "s" : ""}`
          : undefined
      }
      open
    >
      <Text style={s.muted}>
        Track what each store needs and follow a release through review. Everything about
        submissions is recorded by you: BuildApps does not connect to any store, has not submitted
        anything, and never calls an app approved or compliant.
      </Text>
      {err ? (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {msg ? (
        <Text accessibilityRole="alert" style={{ color: c.mint, marginVertical: 6 }}>
          {msg}
        </Text>
      ) : null}
      {view.availablePlatforms.map((p: Platform) => (
        <Button
          key={p}
          title={`+ ${PLATFORM_LABEL[p]}`}
          kind="secondary"
          disabled={busy}
          onPress={() =>
            void act(
              () => api.publishing.addTarget(projectId, p),
              () => `${PLATFORM_LABEL[p]} added.`,
            )
          }
        />
      ))}
      {view.targets.map((t) => (
        <TargetBlock key={t.target.id} v={t} act={act} busy={busy} />
      ))}

      <Card>
        <Text style={s.h2}>Publishing Assistance</Text>
        {help && !(assist !== null && closed) ? (
          <View>
            <Text style={s.muted}>{help.summary}</Text>
            <RequestBlock requestId={help.id} act={act} busy={busy} version={help.status} />
            {closed ? (
              <Button
                title="Request Publishing Assistance again"
                kind="secondary"
                onPress={() => setAssist("")}
              />
            ) : null}
          </View>
        ) : assist === null ? (
          <>
            <Text style={s.muted}>
              Ask a vetted expert to help you get ready. You choose what they see, for how long, and
              can revoke it. No payment is taken in this version.
            </Text>
            <Button
              title="Request Publishing Assistance"
              kind="secondary"
              onPress={() => setAssist("")}
            />
          </>
        ) : (
          <View>
            <Text style={s.label}>What do you need help with?</Text>
            <TextInput
              accessibilityLabel="What do you need help with?"
              style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
              multiline
              value={assist}
              onChangeText={setAssist}
            />
            <Text style={s.muted}>Do not include passwords or keys.</Text>
            <Button
              title="Send request"
              disabled={busy || assist.trim().length < 10}
              onPress={() =>
                void act(
                  async () => {
                    await api.publishing.requestAssistance(
                      projectId,
                      assist,
                      view.targets[0]?.target.id,
                    );
                    setAssist(null);
                  },
                  () => "Request sent.",
                )
              }
            />
          </View>
        )}
      </Card>

      {view.events.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.label}>Publishing activity</Text>
          {[...view.events]
            .reverse()
            .slice(0, 12)
            .map((e) => (
              <Text key={e.id} style={s.muted}>
                • {e.action.replace(/_/g, " ")} - {new Date(e.createdAt).toLocaleDateString()}
              </Text>
            ))}
        </View>
      ) : null}
    </Section>
  );
}

function TargetBlock({ v, act, busy }: { v: TargetV; act: Act; busy: boolean }) {
  const t = v.target;
  const r = v.readiness;
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(t.metadata).map(([k, x]) => [k, String(x ?? "")])),
  );
  const [claim, setClaim] = useState<{
    key: string;
    kind: "self_reported" | "not_applicable";
    note: string;
  } | null>(null);
  const [rel, setRel] = useState({ version: "", build: "" });
  const [pf, pfLabel] = PLATFORM_FIELD[t.platform];
  const open = r.results.filter((x) => x.status === "missing" || x.status === "blocked");

  return (
    <Section
      title={PLATFORM_LABEL[t.platform]}
      badge={r.readyToSubmit ? "ready" : "not ready"}
      open
    >
      <Text style={s.muted}>{v.integration.note}</Text>
      <Text style={s.text}>
        {r.requiredVerified} verified • {r.requiredSelfReported} self-reported • {r.counts.missing}{" "}
        missing • {r.counts.blocked} blocked
      </Text>
      <Text style={[s.muted, { marginBottom: 6 }]}>{r.disclaimer}</Text>
      {r.blockers.map((b) => (
        <View key={b} style={s.err}>
          <Text style={s.text}>Blocked: {b}</Text>
        </View>
      ))}

      <Section title={`Requirements (${open.length} to do)`} open={open.length > 0}>
        {r.results.map((x) => (
          <View
            key={x.key}
            style={{ paddingVertical: 8, borderTopColor: c.line, borderTopWidth: 1 }}
          >
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Text style={[s.text, { flex: 1 }]}>{x.title}</Text>
              <Badge text={STATUS[x.status].label} tone={STATUS[x.status].tone} />
            </View>
            <Text style={s.muted}>{x.reason}</Text>
            {x.claimable &&
            x.source !== "system_evidence" &&
            x.source !== "metadata" &&
            x.status !== "not_applicable" ? (
              x.status === "self_reported" ? (
                <Button
                  title="Undo"
                  kind="secondary"
                  disabled={busy}
                  onPress={() => void act(() => api.publishing.removeClaim(t.id, x.key))}
                />
              ) : (
                <Button
                  title="I've done this"
                  kind="secondary"
                  disabled={busy}
                  onPress={() => setClaim({ key: x.key, kind: "self_reported", note: "" })}
                />
              )
            ) : null}
            {x.canBeNotApplicable && x.status === "missing" ? (
              <Button
                title="Not applicable"
                kind="secondary"
                disabled={busy}
                onPress={() => setClaim({ key: x.key, kind: "not_applicable", note: "" })}
              />
            ) : null}
            {claim?.key === x.key ? (
              <View>
                <Text style={s.label}>
                  {claim.kind === "self_reported"
                    ? "What did you do? (your claim - not verified)"
                    : "Why does this not apply?"}
                </Text>
                <TextInput
                  accessibilityLabel="Note"
                  style={s.input}
                  value={claim.note}
                  onChangeText={(n) => setClaim({ ...claim, note: n })}
                />
                <Button
                  title="Save"
                  disabled={busy || claim.note.trim().length < 5}
                  onPress={() =>
                    void act(async () => {
                      await api.publishing.claim(t.id, claim.key, claim.kind, claim.note);
                      setClaim(null);
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        ))}
      </Section>

      <Section title="Listing details">
        {FIELDS.map(([k, label, multi]) => (
          <View key={k}>
            <Text style={s.label}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              style={[s.input, multi && { minHeight: 80, textAlignVertical: "top" }]}
              multiline={multi}
              autoCapitalize="none"
              value={form[k] ?? ""}
              onChangeText={(x) => setForm({ ...form, [k]: x })}
            />
          </View>
        ))}
        <Text style={s.label}>{pfLabel}</Text>
        <TextInput
          accessibilityLabel={pfLabel}
          style={s.input}
          autoCapitalize="none"
          value={form[pf] ?? ""}
          onChangeText={(x) => setForm({ ...form, [pf]: x })}
        />
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {(["hasLogin", "collectsUserData"] as const).map((k) => (
            <Button
              key={k}
              title={`${k === "hasLogin" ? "Has login" : "Collects data"}: ${form[k] === "true" ? "Yes" : form[k] === "false" ? "No" : "Not set"}`}
              kind="secondary"
              onPress={() =>
                setForm({
                  ...form,
                  [k]: form[k] === "true" ? "false" : form[k] === "false" ? "" : "true",
                })
              }
            />
          ))}
        </View>
        <Button
          title="Save listing details"
          disabled={busy}
          onPress={() =>
            void act(
              () =>
                api.publishing.saveMetadata(
                  t.id,
                  Object.fromEntries(
                    Object.entries(form)
                      .filter(([, x]) => x !== "")
                      .map(([k, x]) => [
                        k,
                        k === "hasLogin" || k === "collectsUserData" ? x === "true" : x,
                      ]),
                  ),
                ),
              () => "Listing details saved.",
            )
          }
        />
      </Section>

      <Section title={`Releases (${v.releases.length})`} open>
        {v.releases.map((rv) => (
          <ReleaseBlock key={rv.release.id} v={rv} act={act} busy={busy} />
        ))}
        <Text style={s.label}>New release version</Text>
        <TextInput
          accessibilityLabel="New release version"
          style={s.input}
          placeholder="1.0.0"
          autoCapitalize="none"
          value={rel.version}
          onChangeText={(x) => setRel({ ...rel, version: x })}
        />
        <TextInput
          accessibilityLabel="Build number"
          style={s.input}
          placeholder="Build number (optional)"
          value={rel.build}
          onChangeText={(x) => setRel({ ...rel, build: x })}
        />
        <Button
          title="Create release"
          disabled={busy || !rel.version.trim()}
          onPress={() =>
            void act(
              async () => {
                await api.publishing.createRelease(t.id, rel.version, rel.build || undefined);
                setRel({ version: "", build: "" });
              },
              () => "Release created.",
            )
          }
        />
      </Section>
    </Section>
  );
}

function ReleaseBlock({ v, act, busy }: { v: ReleaseV; act: Act; busy: boolean }) {
  const r = v.release;
  const [form, setForm] = useState(false);
  const [o, setO] = useState<{ outcome: ReviewOutcome; category: ReasonCategory; message: string }>(
    { outcome: "rejected", category: "metadata", message: "" },
  );
  const [newTask, setNewTask] = useState("");
  const [wontFix, setWontFix] = useState<{ id: string; note: string } | null>(null);
  const active = r.status === "submitted" || r.status === "in_review";
  return (
    <View style={{ borderTopColor: c.line, borderTopWidth: 1, paddingVertical: 8 }}>
      <Text style={s.text}>
        v{r.version}
        {r.buildNumber ? ` (build ${r.buildNumber})` : ""}
      </Text>
      <Badge
        text={RELEASE_TEXT[r.status] ?? r.status}
        tone={r.status === "rejected" ? "warn" : "muted"}
      />
      {["draft", "ready", "rejected"].includes(r.status)
        ? v.gate.reasons.slice(0, 4).map((x) => (
            <Text key={x} style={s.muted}>
              • {x}
            </Text>
          ))
        : null}

      {r.status === "draft" ? (
        <Button
          title="Mark ready to submit"
          disabled={busy || !v.gate.canMarkReady}
          onPress={() =>
            void act(
              () => api.publishing.markReady(r.id),
              () => "Marked ready.",
            )
          }
        />
      ) : null}
      {r.status === "ready" ? (
        <>
          <Text style={s.muted}>
            BuildApps does not submit anything. Submit in the store yourself, then record it here.
          </Text>
          <Button
            title="I submitted this to the store"
            disabled={busy || !v.gate.canSubmit}
            onPress={() =>
              void act(
                () => api.publishing.recordSubmission(r.id),
                () => "Submission recorded.",
              )
            }
          />
          <Button
            title="Back to draft"
            kind="secondary"
            disabled={busy}
            onPress={() => void act(() => api.publishing.unready(r.id))}
          />
        </>
      ) : null}
      {r.status === "submitted" ? (
        <Button
          title="Store started review"
          disabled={busy}
          onPress={() => void act(() => api.publishing.markInReview(r.id))}
        />
      ) : null}
      {active ? (
        <Button title="Record review result" disabled={busy} onPress={() => setForm(!form)} />
      ) : null}
      {form && active ? (
        <View>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {REVIEW_OUTCOMES.map((x) => (
              <Button
                key={x}
                title={x === "info_requested" ? "More info" : x[0]!.toUpperCase() + x.slice(1)}
                kind={o.outcome === x ? "primary" : "secondary"}
                onPress={() => setO({ ...o, outcome: x })}
              />
            ))}
          </View>
          {o.outcome !== "approved" ? (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {REASON_CATEGORIES.map((x) => (
                <Button
                  key={x}
                  title={REASON_LABEL[x]!}
                  kind={o.category === x ? "primary" : "secondary"}
                  onPress={() => setO({ ...o, category: x })}
                />
              ))}
            </View>
          ) : null}
          <TextInput
            accessibilityLabel="Reviewer message"
            style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
            placeholder="Paste or summarise the reviewer's message"
            placeholderTextColor="#6b64a8"
            value={o.message}
            onChangeText={(x) => setO({ ...o, message: x })}
          />
          <Text style={s.muted}>
            Recorded as your report; BuildApps cannot confirm it with the store.
          </Text>
          <Button
            title="Save result"
            disabled={busy || !o.message.trim()}
            onPress={() =>
              void act(
                async () => {
                  await api.publishing.recordOutcome(
                    r.id,
                    o.outcome,
                    o.message,
                    o.outcome === "approved" ? undefined : o.category,
                  );
                  setForm(false);
                  setO({ ...o, message: "" });
                },
                () => "Review result recorded.",
              )
            }
          />
        </View>
      ) : null}
      {r.status === "rejected" ? (
        <View>
          <Text style={s.text}>
            Fix these, then resubmit
            {v.unresolvedActions > 0 ? ` (${v.unresolvedActions} unresolved)` : ""}
          </Text>
          <Button
            title="I resubmitted this to the store"
            disabled={busy || !v.gate.canResubmit}
            onPress={() =>
              void act(
                () => api.publishing.resubmit(r.id),
                () => "Resubmission recorded.",
              )
            }
          />
        </View>
      ) : null}
      {r.status === "approved" ? (
        <Button
          title="I released it"
          disabled={busy}
          onPress={() =>
            void act(
              () => api.publishing.markReleased(r.id),
              () => "Marked released.",
            )
          }
        />
      ) : null}

      {v.actions.map((a) => (
        <View key={a.id} style={{ paddingVertical: 6 }}>
          <Text style={s.text}>{a.title}</Text>
          {a.detail ? <Text style={s.muted}>{a.detail}</Text> : null}
          {a.note ? <Text style={s.muted}>Note: {a.note}</Text> : null}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {ACTION_STATUSES.map((st: ActionStatus) => (
              <Button
                key={st}
                title={st === "wont_fix" ? "Won't fix" : st.replace("_", " ")}
                kind={a.status === st ? "primary" : "secondary"}
                disabled={busy}
                onPress={() =>
                  st === "wont_fix"
                    ? setWontFix({ id: a.id, note: "" })
                    : void act(() => api.publishing.updateAction(a.id, st))
                }
              />
            ))}
          </View>
          {wontFix?.id === a.id ? (
            <View>
              <TextInput
                accessibilityLabel="Why not?"
                style={s.input}
                placeholder="Why not?"
                placeholderTextColor="#6b64a8"
                value={wontFix.note}
                onChangeText={(x) => setWontFix({ id: a.id, note: x })}
              />
              <Button
                title="Save"
                disabled={wontFix.note.trim().length < 5}
                onPress={() =>
                  void act(async () => {
                    await api.publishing.updateAction(a.id, "wont_fix", wontFix.note);
                    setWontFix(null);
                  })
                }
              />
            </View>
          ) : null}
        </View>
      ))}
      {!["released", "withdrawn"].includes(r.status) ? (
        <View>
          <TextInput
            accessibilityLabel="Add a task"
            style={s.input}
            placeholder="Add a task"
            placeholderTextColor="#6b64a8"
            value={newTask}
            onChangeText={setNewTask}
          />
          <Button
            title="Add task"
            kind="secondary"
            disabled={busy || newTask.trim().length < 3}
            onPress={() =>
              void act(async () => {
                await api.publishing.addAction(r.id, newTask);
                setNewTask("");
              })
            }
          />
        </View>
      ) : null}
      {["draft", "ready", "submitted", "in_review", "rejected"].includes(r.status) ? (
        <Button
          title="Withdraw release"
          kind="secondary"
          disabled={busy}
          onPress={() =>
            Alert.alert("Withdraw this release?", undefined, [
              { text: "Keep", style: "cancel" },
              {
                text: "Withdraw",
                style: "destructive",
                onPress: () => void act(() => api.publishing.withdraw(r.id)),
              },
            ])
          }
        />
      ) : null}
      {v.submissions.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          {v.submissions.map((sub) => (
            <Text key={sub.id} style={s.muted}>
              Attempt {sub.attemptNumber}: {sub.status.replace("_", " ")}
              {v.feedback
                .filter((f) => f.submissionId === sub.id)
                .map((f) => ` - "${f.message.slice(0, 80)}"`)
                .join("")}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
