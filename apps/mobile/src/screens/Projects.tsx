import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { calculateProgress } from "@buildapps/core";
import type { Project, ProjectIntake } from "@buildapps/api-client";
import { Badge, Bar, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";

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
