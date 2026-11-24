import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { initDraft, toAnswer, type Answer, type Draft } from "@buildapps/lessons";
import type { PlacementCheck } from "@buildapps/api-client";
import { ExerciseView } from "../components/ExerciseView";
import { Bar, Button, s } from "../components/ui";
import { api } from "../lib/session";

type Outcome = { passed: boolean; results: { exerciseId: string; correct: boolean }[] };

/** Skill check: no feedback until the end, no XP for passing; it only lets the learner skip ahead. */
export function CheckScreen({ skillId, onExit }: { skillId: string; onExit: () => void }) {
  const [check, setCheck] = useState<PlacementCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  useEffect(() => {
    api
      .placement(skillId)
      .then(setCheck)
      .catch((e) => setErr(e.message));
  }, [skillId]);
  const ex = check?.exercises[i];
  useEffect(() => {
    if (ex) setDraft(initDraft(ex));
  }, [ex]);

  async function next() {
    if (!check || !ex || !draft) return;
    const all = { ...answers, [ex.id]: toAnswer(draft) };
    setAnswers(all);
    if (i < check.exercises.length - 1) return setI(i + 1);
    setBusy(true);
    try {
      setOut(await api.submitPlacement(check.skillId, all));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }
  if (err)
    return (
      <View style={{ padding: 16 }}>
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
        <Button title="Back" kind="secondary" onPress={onExit} />
      </View>
    );
  if (!check) return <Text style={[s.muted, { padding: 16 }]}>Loading skill check...</Text>;
  if (out)
    return (
      <View style={{ padding: 16, gap: 12 }} accessibilityLiveRegion="polite">
        <Text style={s.h2} accessibilityRole="header">
          {out.passed ? "You can skip this one" : "Not quite yet"}
        </Text>
        <Text style={s.muted}>
          {out.passed
            ? `${check.skillName} is unlocked for what comes next. You earn XP and mastery by doing its lessons whenever you like.`
            : `You got ${out.results.filter((r) => r.correct).length} of ${out.results.length}. The lessons will cover the gaps, and you can try again later.`}
        </Text>
        <Button title="Back to your path" onPress={onExit} />
      </View>
    );
  if (!ex || !draft) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      <Bar pct={((i + 1) / check.exercises.length) * 100} label="Skill check progress" />
      <Text style={s.h2} accessibilityRole="header">
        Skill check: {check.skillName}
      </Text>
      <Text style={s.muted}>
        Question {i + 1} of {check.exercises.length}. No feedback until the end, and passing earns
        no XP: it only lets you skip ahead.
      </Text>
      <ExerciseView exercise={ex} draft={draft} setDraft={setDraft} result={null} />
      <Button
        title={i < check.exercises.length - 1 ? "Next" : busy ? "Checking..." : "Submit answers"}
        onPress={() => void next()}
      />
      <Button title="Leave the check" kind="secondary" onPress={onExit} />
    </ScrollView>
  );
}
