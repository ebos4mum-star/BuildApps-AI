import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import {
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  INTENT_OPTIONS,
  PACE_OPTIONS,
  PLATFORM_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  TOOL_OPTIONS,
  parseProfile,
  type LearnerProfile,
} from "@buildapps/core";
import { Bar, Button, s } from "../components/ui";
import { haptic } from "../lib/haptics";
import { api } from "../lib/session";
import { c } from "../theme";

type Draft = Partial<LearnerProfile> & { reminders: LearnerProfile["reminders"] };
const STEPS = ["experience", "goals", "tools", "intent", "pace", "targets", "reminders"] as const;
const TITLES = {
  experience: "How much have you built?",
  goals: "What do you want to get out of this?",
  tools: "Which AI tools do you use?",
  intent: "What are you doing right now?",
  pace: "How much time can you give it?",
  targets: "What are you building, and for where?",
  reminders: "Want a gentle nudge?",
} as const;

interface Option {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
}
function Choices({
  label,
  options,
  selected,
  multi,
  onChange,
}: {
  label: string;
  options: readonly Option[];
  selected: readonly string[];
  multi: boolean;
  onChange: (v: string[]) => void;
}) {
  return (
    <View
      accessibilityRole={multi ? undefined : "radiogroup"}
      accessibilityLabel={label}
      style={{ gap: 10 }}
    >
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <Pressable
            key={o.id}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}. ${o.blurb}`}
            onPress={() => {
              haptic.tap();
              onChange(
                multi ? (on ? selected.filter((x) => x !== o.id) : [...selected, o.id]) : [o.id],
              );
            }}
            style={({ pressed }) => ({
              backgroundColor: c.surface,
              borderRadius: 16,
              padding: 14,
              borderWidth: 3,
              borderColor: on ? c.mint : c.line,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              minHeight: 56,
            })}
          >
            <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>
              {o.emoji} {o.title}
            </Text>
            <Text style={s.muted}>{o.blurb}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Same seven questions as the web, in the same words (shared copy lives in @buildapps/core). */
export function OnboardingScreen({
  initial,
  onDone,
  onSkip,
}: {
  initial?: LearnerProfile | null;
  onDone: (p: LearnerProfile) => void;
  onSkip: () => void;
}) {
  const [d, setD] = useState<Draft>(initial ?? { reminders: { enabled: false, hour: 18 } });
  const [i, setI] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step = STEPS[i]!;
  const canNext =
    step === "experience"
      ? !!d.experience
      : step === "goals"
        ? !!d.goals?.length
        : step === "tools"
          ? !!d.tools?.length
          : step === "intent"
            ? !!d.intent
            : step === "pace"
              ? !!d.pace
              : true;
  async function finish() {
    const r = parseProfile({ projectTypes: [], platforms: [], ...d });
    if (!r.ok) return setErr(r.issues.map((x) => x.message).join(". "));
    setBusy(true);
    setErr(null);
    try {
      await api.saveProfile(r.profile);
      onDone(r.profile);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }
  const one = (v?: string) => (v ? [v] : []);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
      <Bar pct={((i + 1) / STEPS.length) * 100} label="Onboarding progress" />
      <Text style={s.muted}>
        Step {i + 1} of {STEPS.length}
      </Text>
      <Text style={s.h2} accessibilityRole="header">
        {TITLES[step]}
      </Text>
      {err ? (
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {step === "experience" && (
        <Choices
          label="Experience"
          options={EXPERIENCE_OPTIONS}
          multi={false}
          selected={one(d.experience)}
          onChange={([v]) => setD({ ...d, experience: v as LearnerProfile["experience"] })}
        />
      )}
      {step === "goals" && (
        <Choices
          label="Goals (pick any)"
          options={GOAL_OPTIONS}
          multi
          selected={d.goals ?? []}
          onChange={(v) => setD({ ...d, goals: v as LearnerProfile["goals"] })}
        />
      )}
      {step === "tools" && (
        <Choices
          label="AI tools (pick any)"
          options={TOOL_OPTIONS}
          multi
          selected={d.tools ?? []}
          onChange={(v) => setD({ ...d, tools: v as LearnerProfile["tools"] })}
        />
      )}
      {step === "intent" && (
        <Choices
          label="What you are doing"
          options={INTENT_OPTIONS}
          multi={false}
          selected={one(d.intent)}
          onChange={([v]) => setD({ ...d, intent: v as LearnerProfile["intent"] })}
        />
      )}
      {step === "pace" && (
        <Choices
          label="Learning pace"
          options={PACE_OPTIONS}
          multi={false}
          selected={one(d.pace)}
          onChange={([v]) => setD({ ...d, pace: v as LearnerProfile["pace"] })}
        />
      )}
      {step === "targets" && (
        <>
          <Text style={s.h2}>Project type</Text>
          <Choices
            label="Project types (pick any)"
            options={PROJECT_TYPE_OPTIONS}
            multi
            selected={d.projectTypes ?? []}
            onChange={(v) => setD({ ...d, projectTypes: v as LearnerProfile["projectTypes"] })}
          />
          <Text style={s.h2}>Where will it run?</Text>
          <Choices
            label="Platforms (pick any)"
            options={PLATFORM_OPTIONS}
            multi
            selected={d.platforms ?? []}
            onChange={(v) => setD({ ...d, platforms: v as LearnerProfile["platforms"] })}
          />
        </>
      )}
      {step === "reminders" && (
        <View style={{ gap: 10 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={s.text} nativeID="rem-label">
              Remind me to practise
            </Text>
            <Switch
              accessibilityLabelledBy="rem-label"
              value={d.reminders.enabled}
              onValueChange={(enabled) => setD({ ...d, reminders: { ...d.reminders, enabled } })}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {[8, 12, 18, 21].map((h) => (
              <Button
                key={h}
                title={`${String(h).padStart(2, "0")}:00`}
                kind={d.reminders.hour === h ? "primary" : "secondary"}
                onPress={() => setD({ ...d, reminders: { ...d.reminders, hour: h } })}
              />
            ))}
          </View>
          <Text style={s.muted}>
            Reminders appear in the app until push delivery is set up. Missing a day never costs you
            anything.
          </Text>
        </View>
      )}
      {i < STEPS.length - 1 ? (
        <Button title="Continue" onPress={() => canNext && setI(i + 1)} />
      ) : (
        <Button title={busy ? "Saving..." : "Build my plan"} onPress={() => void finish()} />
      )}
      {i > 0 ? <Button title="Back" kind="secondary" onPress={() => setI(i - 1)} /> : null}
      <Button title="Skip for now" kind="secondary" onPress={onSkip} />
    </ScrollView>
  );
}
