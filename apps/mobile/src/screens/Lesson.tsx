import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, Text, View } from "react-native";
import {
  currentExerciseId,
  initDraft,
  isComplete,
  recordResult,
  sessionProgress,
  startSession,
  toAnswer,
  type Draft,
  type SessionState,
} from "@buildapps/lessons";
import type { AttemptOutcome, LessonPayload } from "@buildapps/api-client";
import { ExerciseView } from "../components/ExerciseView";
import { Bar, Button, s, useReduceMotion } from "../components/ui";
import { api, localTimeZone } from "../lib/session";
import { c } from "../theme";

export function LessonScreen({ lessonId, onExit }: { lessonId: string; onExit: () => void }) {
  const [lesson, setLesson] = useState<LessonPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .lesson(lessonId)
      .then(setLesson)
      .catch((e) => setErr(e.message));
  }, [lessonId]);
  if (err)
    return (
      <View style={{ padding: 16 }}>
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
        <Button title="Back" kind="secondary" onPress={onExit} />
      </View>
    );
  if (!lesson) return <Text style={[s.muted, { padding: 16 }]}>Loading lesson...</Text>;
  return <Player lesson={lesson} onExit={onExit} />;
}

function Player({ lesson, onExit }: { lesson: LessonPayload; onExit: () => void }) {
  const byId = new Map(lesson.exercises.map((e) => [e.id, e]));
  const [session, setSession] = useState<SessionState>(() =>
    startSession(lesson, lesson.passedExerciseIds),
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<AttemptOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const [round, setRound] = useState(0);
  const [totals, setTotals] = useState({
    xp: 0,
    streak: 0,
    levelUps: [] as string[],
    achievements: [] as string[],
  });
  const reduce = useReduceMotion();
  const slide = useRef(new Animated.Value(0)).current;

  const exId = currentExerciseId(session);
  const exercise = exId ? byId.get(exId) : undefined;
  useEffect(() => {
    if (exercise) setDraft(initDraft(exercise));
  }, [exercise, round]);
  useEffect(() => {
    slide.setValue(result ? (reduce ? 1 : 0) : 0);
    if (result && !reduce)
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
  }, [result, reduce, slide]);

  async function check() {
    if (!exercise || !draft) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await api.submitAttempt(exercise.id, toAnswer(draft), localTimeZone());
      setResult(out);
      setTotals((t) => ({
        xp: t.xp + out.xpAwarded,
        streak: out.streak.current,
        levelUps: [...t.levelUps, ...out.skillLevelUps.map((x) => `${x.skillId} ${x.level}`)],
        achievements: [...t.achievements, ...out.newAchievements.map((a) => a.name)],
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not check your answer");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (!exercise || !result) return;
    setSession((x) => recordResult(x, exercise.id, result.correct));
    setResult(null);
    setRound((r) => r + 1);
  }

  if (session.status === "complete") {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
        <Text style={{ fontSize: 64 }} accessibilityElementsHidden>
          🎉
        </Text>
        <Text style={s.h1} accessibilityRole="header">
          Lesson complete!
        </Text>
        <Text style={s.muted}>{lesson.title}</Text>
        <Text style={[s.h2, { color: c.sun }]}>
          ⚡ +{totals.xp} XP{totals.streak > 0 ? `   🔥 ${totals.streak}-day streak` : ""}
        </Text>
        <Text style={s.text}>✨ {session.firstTry.length} first-try</Text>
        {totals.levelUps.length > 0 && (
          <Text style={[s.text, { color: c.mint, marginTop: 8 }]}>
            Skill up: {totals.levelUps.join(", ")}
          </Text>
        )}
        {totals.achievements.length > 0 && (
          <Text style={[s.text, { color: c.sun, marginTop: 8 }]}>
            Achievement: {totals.achievements.join(", ")}
          </Text>
        )}
        <View style={{ alignSelf: "stretch", marginTop: 24 }}>
          <Button title="Continue" onPress={onExit} />
        </View>
      </ScrollView>
    );
  }
  if (intro && session.passed.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: "center" }}>
        <Text style={{ fontSize: 56 }}>🤖</Text>
        <Text style={s.h1} accessibilityRole="header">
          {lesson.title}
        </Text>
        <Text style={[s.muted, { textAlign: "center", marginBottom: 20 }]}>{lesson.hook}</Text>
        <Button title="Let's go" onPress={() => setIntro(false)} style={{ alignSelf: "stretch" }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
        <Text
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Leave lesson"
          style={{ color: c.muted, fontSize: 24 }}
        >
          ✕
        </Text>
        <View style={{ flex: 1 }}>
          <Bar
            pct={sessionProgress(session, lesson.exercises.length) * 100}
            label="Lesson progress"
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>
        {exercise && draft && (
          <ExerciseView exercise={exercise} draft={draft} setDraft={setDraft} result={result} />
        )}
        {err && (
          <View style={s.err} accessibilityRole="alert">
            <Text style={s.text}>{err}</Text>
          </View>
        )}
      </ScrollView>
      {!result ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            backgroundColor: "#130f2a",
            borderTopColor: c.line,
            borderTopWidth: 2,
          }}
        >
          <Button
            title={busy ? "Checking..." : "Check"}
            disabled={busy || !exercise || !draft || !isComplete(exercise, draft)}
            onPress={check}
          />
        </View>
      ) : (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            backgroundColor: result.correct ? "#0f3b32" : "#43202c",
            borderTopColor: result.correct ? c.mint : c.coral,
            borderTopWidth: 3,
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [200, 0] }) },
            ],
          }}
        >
          <Text style={[s.h2, { color: result.correct ? c.mint : c.coral, marginTop: 0 }]}>
            {result.correct ? "Nice work!" : "Not quite"}
            {result.xpAwarded > 0 ? `   +${result.xpAwarded} XP` : ""}
          </Text>
          <Text style={s.text}>{result.message}</Text>
          <Text style={[s.muted, { marginVertical: 6 }]}>Why: {result.explanation}</Text>
          <Button
            title={result.correct ? "Continue" : "Got it"}
            kind={result.correct ? "primary" : "danger"}
            onPress={next}
          />
        </Animated.View>
      )}
    </View>
  );
}
