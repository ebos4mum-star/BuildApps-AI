import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { calculateProgress, RESCUE_STAGES } from "@buildapps/core";
import type { Project, ProjectIntake } from "@buildapps/api-client";
import { Badge, Bar, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { c } from "../theme";

export const JOURNEYS = {
  start: {
    emoji: "🌱",
    title: "Start a project",
    blurb: "I have an idea and want to build it with AI.",
  },
  continue: {
    emoji: "🧭",
    title: "Continue a project",
    blurb: "I already started - help me finish.",
  },
  rescue: { emoji: "🛟", title: "Rescue a project", blurb: "My project is stuck or broken." },
} as const;
type J = keyof typeof JOURNEYS;

export function ProjectsList({
  onOpen,
  onNew,
}: {
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [list, setList] = useState<Project[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .listProjects()
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);
  if (err)
    return (
      <View style={s.err}>
        <Text style={s.text}>{err}</Text>
      </View>
    );
  if (!list) return <Text style={s.muted}>Loading projects...</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1} accessibilityRole="header">
        Your projects
      </Text>
      <Button title="New project" onPress={onNew} />
      {list.length === 0 && (
        <Text style={s.muted}>No projects yet. Start one, continue one, or rescue one.</Text>
      )}
      {list.map((p) => {
        const pr = calculateProgress(p.milestones);
        return (
          <Card key={p.id}>
            <Badge
              text={`${JOURNEYS[p.journey].emoji} ${p.journey} - ${p.state.replace("_", " ")}`}
            />
            <Text
              style={[s.h2, { marginBottom: 6 }]}
              onPress={() => onOpen(p.id)}
              accessibilityRole="button"
            >
              {p.name}
            </Text>
            <Bar pct={pr.overallPercent} label={`${p.name} progress`} />
            <Text style={s.muted}>
              {pr.overallPercent}% done - {pr.verifiedPercent}% verified
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [journey, setJourney] = useState<J | null>(null);
  const [f, setF] = useState({ name: "", idea: "", description: "", repoUrl: "", problem: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!journey) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.h1} accessibilityRole="header">
          Where are you with your app?
        </Text>
        {(Object.keys(JOURNEYS) as J[]).map((k) => (
          <Card key={k}>
            <Text style={{ fontSize: 28 }}>{JOURNEYS[k].emoji}</Text>
            <Text style={s.h2}>{JOURNEYS[k].title}</Text>
            <Text style={s.muted}>{JOURNEYS[k].blurb}</Text>
            <Button title="Choose" onPress={() => setJourney(k)} />
          </Card>
        ))}
      </ScrollView>
    );
  }
  const field = (label: string, key: keyof typeof f, multiline = false, placeholder?: string) => (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: "top" }]}
        multiline={multiline}
        value={f[key]}
        onChangeText={(t) => setF({ ...f, [key]: t })}
        placeholder={placeholder}
        placeholderTextColor="#6b64a8"
        autoCapitalize="none"
      />
    </View>
  );
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const intake: ProjectIntake =
        journey === "start"
          ? { journey, name: f.name, idea: f.idea, platform: "cross_platform" }
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
      onCreated(p.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create project");
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1} accessibilityRole="header">
        {JOURNEYS[journey].emoji} {JOURNEYS[journey].title}
      </Text>
      {field("Project name", "name")}
      {journey === "start" && field("What do you want to build?", "idea", true)}
      {journey === "continue" && (
        <>
          {field("Where are you now?", "description", true)}
          {field("GitHub URL (optional)", "repoUrl", false, "https://github.com/you/project")}
        </>
      )}
      {journey === "rescue" && (
        <>
          {field("GitHub repository URL", "repoUrl", false, "https://github.com/you/project")}
          {field("What went wrong?", "problem", true)}
          <Text style={s.muted}>Read-only access only. Nothing runs without sandboxing.</Text>
        </>
      )}
      {err && (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      )}
      <Button title={busy ? "Creating..." : "Create project"} disabled={busy} onPress={submit} />
    </ScrollView>
  );
}

export function ProjectDetail({ id }: { id: string }) {
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
      <View style={s.err}>
        <Text style={s.text}>{err}</Text>
      </View>
    ) : (
      <Text style={s.muted}>Loading...</Text>
    );
  const pr = calculateProgress(p.milestones);
  const stage = p.recovery ? RESCUE_STAGES.indexOf(p.recovery.stage) : -1;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Badge text={`${JOURNEYS[p.journey].title} - ${p.state.replace("_", " ")}`} />
      <Text style={s.h1} accessibilityRole="header">
        {p.name}
      </Text>
      {err && (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      )}
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
      </Card>
      {p.recovery && (
        <Card>
          <Text style={s.h2}>Recovery plan</Text>
          <Text style={s.muted}>
            {RESCUE_STAGES.map((st, i) => (i === stage ? `[${st}]` : st)).join("  >  ")}
          </Text>
          {stage < RESCUE_STAGES.length - 1 && (
            <Button
              title="Next stage"
              disabled={busy}
              onPress={() => act(() => api.advanceRecovery(p.id))}
            />
          )}
          {p.recovery.humanHelpRequested ? (
            <Badge text="Expert help requested" tone="ok" />
          ) : help === null ? (
            <Button title="Ask a vetted developer" kind="secondary" onPress={() => setHelp("")} />
          ) : (
            <View>
              <Text style={s.label}>What do you need help with?</Text>
              <TextInput
                accessibilityLabel="What do you need help with?"
                style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
                value={help}
                onChangeText={setHelp}
              />
              <Text style={s.muted}>
                Your project is only shared after you approve a scoped handoff.
              </Text>
              <Button
                title="Send request"
                disabled={busy || help.trim().length < 10}
                onPress={() =>
                  act(async () => {
                    const r = await api.requestHumanHelp(p.id, help);
                    setHelp(null);
                    return r;
                  })
                }
              />
            </View>
          )}
        </Card>
      )}
      <Card>
        <Text style={s.h2}>Milestones</Text>
        {p.milestones.map((m) => (
          <View
            key={m.id}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 }}
          >
            <Text>{m.status === "done" ? "✅" : "⬜"}</Text>
            <Text style={[s.text, { flex: 1 }]}>
              {m.title}
              {m.required ? "" : " (optional)"}
            </Text>
            {m.completion?.source === "verified" && <Badge text="Verified" tone="verified" />}
            {m.completion?.source === "user_reported" && <Badge text="Self-reported" tone="warn" />}
            {m.status !== "done" && p.state === "active" && (
              <Text
                onPress={() => act(() => api.reportMilestone(p.id, m.id))}
                accessibilityRole="button"
                style={{ color: c.mint, fontWeight: "900" }}
              >
                DONE
              </Text>
            )}
          </View>
        ))}
      </Card>
      {p.state === "active" && (
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
      )}
      {p.state === "needs_help" && (
        <Button
          title="Back to work"
          disabled={busy}
          onPress={() => act(() => api.setProjectState(p.id, "active"))}
        />
      )}
      <Text style={[s.h2, { marginTop: 14 }]}>Coming next</Text>
      <Text style={s.muted}>
        Project Rescue Scanner - Build Verification Lab - Publishing Center ($25/app/year). Not
        available yet.
      </Text>
    </ScrollView>
  );
}
