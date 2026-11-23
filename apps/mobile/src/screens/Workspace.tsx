import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, TextInput, View } from "react-native";
import { RESCUE_STAGES } from "@buildapps/core";
import type {
  FindingRow,
  FindingStatus,
  InstallationRow,
  RepoInfo,
  WorkspaceView,
} from "@buildapps/api-client";
import { Badge, Bar, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { Section } from "../components/Section";
import { PublishingSection } from "./Publishing";
import { RequestBlock, type Act } from "./RequestBlock";
import { c } from "../theme";

const KIND = {
  verified: "Verified in repo",
  static_warning: "Static warning",
  recommendation: "Unverified recommendation",
} as const;
const ICON = { pass: "✅", fail: "❌", skipped: "⏳", unavailable: "➖" } as const;

export function WorkspaceScreen({ id }: { id: string }) {
  const [ws, setWs] = useState<WorkspaceView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => setWs(await api.workspace(id)), [id]);
  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, [reload]);

  async function act<T>(fn: () => Promise<T>, done?: (r: T) => string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      if (done) setMsg(done(r));
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  if (!ws)
    return err ? (
      <View style={{ padding: 16 }}>
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
      </View>
    ) : (
      <Text style={[s.muted, { padding: 16 }]}>Loading...</Text>
    );
  const p = ws.project;
  const pr = ws.progress;
  const open = ws.findings.filter((f) => f.status === "open" || f.status === "in_progress");

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Badge text={`${p.journey} - ${p.state.replace("_", " ")}`} />
      <Text style={s.h1} accessibilityRole="header">
        {p.name}
      </Text>
      {err ? (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {msg ? (
        <Text accessibilityRole="alert" style={{ color: c.mint, marginBottom: 8 }}>
          {msg}
        </Text>
      ) : null}

      <Card>
        <Text style={s.text}>
          {
            {
              incomplete: "In progress",
              user_reported: "Complete (self-reported)",
              verified: "Complete (verified)",
            }[pr.completion]
          }
        </Text>
        <Text style={s.muted}>All completed work</Text>
        <Bar pct={pr.overallPercent} label="Overall progress" />
        <Text style={[s.muted, { marginTop: 8 }]}>Automatically verified only</Text>
        <Bar pct={pr.verifiedPercent} label="Verified progress" />
        <Text style={[s.text, { marginTop: 10 }]}>
          {ws.readiness.ready ? "✅ Ready to publish" : "⚠️ Not ready to publish yet"}
        </Text>
        {!ws.readiness.ready &&
          ws.readiness.blockers.map((b) => (
            <Text key={b} style={s.muted}>
              • {b}
            </Text>
          ))}
      </Card>

      <GithubSection ws={ws} act={act} busy={busy} />

      <Section title="Milestones" open>
        {p.milestones.map((m) => (
          <View
            key={m.id}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 }}
          >
            <Text>{m.status === "done" ? "✅" : "⬜"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.text}>
                {m.title}
                {m.required ? "" : " (optional)"}
              </Text>
              {m.completion?.evidenceRef ? (
                <Text style={s.muted}>
                  Evidence:{" "}
                  {m.completion.evidenceRef.startsWith("scan:")
                    ? "repository scan"
                    : "verification run"}
                </Text>
              ) : null}
            </View>
            {m.completion?.source === "verified" ? <Badge text="Verified" tone="verified" /> : null}
            {m.completion?.source === "user_reported" ? (
              <Badge text="Self-reported" tone="warn" />
            ) : null}
            {m.status !== "done" && p.state === "active" ? (
              <Text
                accessibilityRole="button"
                onPress={() => act(() => api.reportMilestone(p.id, m.id))}
                style={{ color: c.mint, fontWeight: "900" }}
              >
                DONE
              </Text>
            ) : null}
          </View>
        ))}
        {p.state === "draft" ? (
          <Button
            title="Start working"
            onPress={() => act(() => api.setProjectState(p.id, "active"))}
          />
        ) : null}
      </Section>

      <FindingsSection ws={ws} open={open} act={act} />

      <Section title="Verification" badge={ws.latestVerification ? undefined : "none yet"}>
        {!ws.latestVerification ? (
          <Text style={s.muted}>
            Run verification (GitHub card) to check CI results and static checks.
          </Text>
        ) : (
          ws.latestVerification.checks.map((k) => (
            <View key={k.id} style={{ paddingVertical: 6 }}>
              <Text style={s.text}>
                {ICON[k.status]} {k.title}
              </Text>
              <Text style={s.muted}>
                {k.source === "ci_checks"
                  ? "From your repository's own CI"
                  : k.source === "sandbox"
                    ? "Isolated test execution is not enabled yet"
                    : "Static check of repository files"}
              </Text>
            </View>
          ))
        )}
        <Text style={[s.muted, { marginTop: 6 }]}>
          Milestones are Verified only from evidence like this, never from a claim or an AI
          explanation.
        </Text>
      </Section>

      <HelpSection ws={ws} act={act} busy={busy} />
      <PublishingSection projectId={p.id} />

      {p.state === "active" ? (
        <>
          <Button
            title="I'm stuck"
            kind="secondary"
            disabled={busy}
            onPress={() => act(() => api.setProjectState(p.id, "needs_help"))}
          />
          <Button
            title="Mark project complete"
            disabled={busy}
            onPress={() => act(() => api.setProjectState(p.id, "completed"))}
          />
        </>
      ) : null}
      {p.state === "needs_help" ? (
        <Button
          title="Back to work"
          disabled={busy}
          onPress={() => act(() => api.setProjectState(p.id, "active"))}
        />
      ) : null}
    </ScrollView>
  );
}

function GithubSection({ ws, act, busy }: { ws: WorkspaceView; act: Act; busy: boolean }) {
  const [status, setStatus] = useState<{
    available: boolean;
    connections: InstallationRow[];
  } | null>(null);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const refresh = useCallback(async () => {
    const st = await api.githubStatus();
    setStatus(st);
    if (!ws.github.connected && st.connections[0])
      setRepos(await api.githubRepos(st.connections[0].id));
    else setRepos(null);
  }, [ws.github.connected]);
  useEffect(() => {
    refresh().catch(() => setStatus({ available: false, connections: [] }));
  }, [refresh]);
  const conn = status?.connections[0];
  const describe = (v: { milestoneKey: string }[]) =>
    v.length === 0
      ? "No milestones newly verified."
      : `Verified: ${v.map((x) => x.milestoneKey).join(", ")}.`;

  return (
    <Section title="GitHub" badge={ws.github.connected ? "connected" : undefined} open>
      <Text style={s.muted}>
        Read-only: BuildApps reads the contents, metadata and CI results of repositories you choose.
        It never changes or runs your code.
      </Text>
      {!status ? (
        <Text style={s.muted}>Loading...</Text>
      ) : !status.available ? (
        <Text style={s.muted}>GitHub integration is not configured on this server.</Text>
      ) : ws.github.connected ? (
        <>
          <Text style={[s.text, { marginVertical: 6 }]}>
            {ws.github.repo} via {ws.github.accountLogin}
          </Text>
          <Button
            title="Scan repository"
            disabled={busy}
            onPress={() =>
              act(
                () => api.scan(ws.project.id),
                (r) =>
                  `Scan complete. ${r.sync.new} new, ${r.sync.resolved} resolved. ${describe(r.verified)}`,
              )
            }
          />
          <Button
            title="Run verification"
            disabled={busy}
            onPress={() =>
              act(
                () => api.verify(ws.project.id),
                (r) => `Verification recorded. ${describe(r.verified)}`,
              )
            }
          />
          <Button
            title="Disconnect & revoke"
            kind="secondary"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Disconnect GitHub?",
                "BuildApps' access to your repositories is revoked.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: () =>
                      void act(
                        () => api.githubDisconnect(ws.github.installationRowId!),
                        (r) =>
                          r.remoteRevoked
                            ? "Disconnected. GitHub access was revoked."
                            : (r.note ?? "Disconnected."),
                      ).then(refresh),
                  },
                ],
              )
            }
          />
        </>
      ) : !conn ? (
        <>
          <Button
            title="Connect GitHub (read-only)"
            disabled={busy}
            onPress={() =>
              void act(
                async () => {
                  const { url } = await api.githubConnect();
                  await Linking.openURL(url);
                  return url;
                },
                () => "Finish in your browser, then come back and pull to refresh.",
              )
            }
          />
          <Button
            title="I've connected - refresh"
            kind="secondary"
            onPress={() => void refresh()}
          />
        </>
      ) : (
        <>
          <Text style={[s.label]}>Choose the repository for this project</Text>
          {repos === null ? (
            <Text style={s.muted}>Loading repositories...</Text>
          ) : repos.length === 0 ? (
            <Text style={s.muted}>
              No repositories shared with BuildApps yet. Add some in your GitHub App settings.
            </Text>
          ) : (
            repos
              .filter(
                (r) =>
                  !ws.project.repo ||
                  r.fullName.toLowerCase() ===
                    `${ws.project.repo.owner}/${ws.project.repo.name}`.toLowerCase(),
              )
              .map((r) => (
                <Button
                  key={r.id}
                  title={`Link ${r.fullName}${r.private ? " (private)" : ""}`}
                  kind="secondary"
                  disabled={busy}
                  onPress={() =>
                    void act(
                      () => api.linkRepo(ws.project.id, conn.id, r.fullName),
                      (x) => `Linked ${x.repo}.`,
                    ).then(refresh)
                  }
                />
              ))
          )}
        </>
      )}
    </Section>
  );
}

function FindingsSection({ ws, open, act }: { ws: WorkspaceView; open: FindingRow[]; act: Act }) {
  const [dismiss, setDismiss] = useState<{ id: string; note: string } | null>(null);
  const a = ws.latestScan?.assessment;
  const setStatus = (f: FindingRow, status: FindingStatus, note?: string) =>
    act(() => api.setFindingStatus(ws.project.id, f.id, status, note));
  if (!ws.latestScan)
    return (
      <Section title="Findings">
        <Text style={s.muted}>Scan the repository to get an evidence-based assessment.</Text>
      </Section>
    );
  return (
    <Section title="Findings" badge={`${open.length} open`} open>
      {a ? <Text style={s.text}>{a.headline}</Text> : null}
      {a ? (
        <Text style={s.muted}>
          {a.byKind.verified} verified • {a.byKind.static_warning} static warnings •{" "}
          {a.byKind.recommendation} recommendations
        </Text>
      ) : null}
      {open.length === 0 ? (
        <Text style={[s.muted, { marginTop: 8 }]}>Nothing open. Nice.</Text>
      ) : (
        open.map((f) => (
          <View
            key={f.id}
            style={{ borderTopColor: c.line, borderTopWidth: 1, paddingVertical: 10 }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Badge
                text={f.severity}
                tone={f.severity === "critical" || f.severity === "high" ? "warn" : "muted"}
              />
              <Badge text={KIND[f.kind]} tone={f.kind === "verified" ? "verified" : "muted"} />
            </View>
            <Text style={[s.text, { fontWeight: "900", marginTop: 4 }]}>{f.title}</Text>
            <Text style={s.muted}>{f.detail}</Text>
            {f.evidence.slice(0, 3).map((e, i) => (
              <Text key={i} style={[s.muted, { fontFamily: "Courier", fontSize: 12 }]}>
                {e.path}
                {e.line ? `:${e.line}` : ""}
                {e.snippet ? `  ${e.snippet}` : ""}
              </Text>
            ))}
            <Text style={[s.text, { marginTop: 4 }]}>Fix: {f.remedy}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {f.status !== "in_progress" ? (
                <Button
                  title="In progress"
                  kind="secondary"
                  onPress={() => void setStatus(f, "in_progress")}
                  style={{ flexGrow: 1 }}
                />
              ) : null}
              <Button
                title="I fixed it"
                kind="secondary"
                onPress={() => void setStatus(f, "resolved")}
                style={{ flexGrow: 1 }}
              />
              <Button
                title="Dismiss"
                kind="secondary"
                onPress={() => setDismiss({ id: f.id, note: "" })}
                style={{ flexGrow: 1 }}
              />
            </View>
            {dismiss?.id === f.id ? (
              <View>
                <Text style={s.label}>Why are you dismissing this? (kept as your decision)</Text>
                <TextInput
                  accessibilityLabel="Reason for dismissing"
                  style={s.input}
                  value={dismiss.note}
                  onChangeText={(t) => setDismiss({ id: f.id, note: t })}
                />
                <Button
                  title="Save decision"
                  disabled={dismiss.note.trim().length < 5}
                  onPress={() =>
                    void setStatus(f, "dismissed", dismiss.note).then(() => setDismiss(null))
                  }
                />
              </View>
            ) : null}
          </View>
        ))
      )}
      <Text style={[s.muted, { marginTop: 8 }]}>
        "I fixed it" is recorded as your claim; the next scan re-checks it. Only scans confirm a
        fix.
      </Text>
    </Section>
  );
}

function HelpSection({ ws, act, busy }: { ws: WorkspaceView; act: Act; busy: boolean }) {
  const p = ws.project;
  const [text, setText] = useState<string | null>(null);
  const run: Act = act;
  const stageIdx = p.recovery ? RESCUE_STAGES.indexOf(p.recovery.stage) : -1;
  const closed = ws.helpRequest
    ? ["completed", "cancelled"].includes(ws.helpRequest.status)
    : false;
  const formVisible = !ws.helpRequest || (text !== null && closed);

  return (
    <Section
      title={p.recovery ? "Recovery & expert help" : "Expert help"}
      badge={ws.helpRequest ? ws.helpRequest.status.replace("_", " ") : undefined}
      open={!!ws.helpRequest}
    >
      {p.recovery ? (
        <Text style={s.muted}>
          {RESCUE_STAGES.map((st, i) => (i === stageIdx ? `[${st}]` : st)).join("  >  ")}
        </Text>
      ) : null}
      {p.recovery && stageIdx < RESCUE_STAGES.length - 1 ? (
        <Button
          title="Next stage"
          kind="secondary"
          disabled={busy}
          onPress={() => act(() => api.advanceRecovery(p.id))}
        />
      ) : null}
      {formVisible ? (
        text === null ? (
          <Button
            title="Ask a vetted developer for help"
            kind="secondary"
            onPress={() => setText("")}
          />
        ) : (
          <View>
            <Text style={s.label}>What do you need help with?</Text>
            <TextInput
              accessibilityLabel="What do you need help with?"
              style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
              multiline
              value={text}
              onChangeText={setText}
            />
            <Text style={s.muted}>
              Nothing is shared until you approve a scoped, time-limited handoff. No payment is
              taken in this version.
            </Text>
            <Button
              title="Send request"
              disabled={busy || text.trim().length < 10}
              onPress={() =>
                void run(async () => {
                  await api.requestHumanHelp(p.id, text);
                  setText(null);
                })
              }
            />
          </View>
        )
      ) : ws.helpRequest ? (
        <View>
          <RequestBlock
            requestId={ws.helpRequest.id}
            act={act}
            busy={busy}
            version={ws.helpRequest.status}
          />
          {closed && text === null ? (
            <Button title="Ask for more help" kind="secondary" onPress={() => setText("")} />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}
