import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Dashboard } from "@buildapps/api-client";
import { Badge, Bar, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { c } from "../theme";

export function LearnScreen({
  onOpenLesson,
  onOpenOnboarding,
  onOpenCheck,
  refreshKey,
}: {
  onOpenLesson: (id: string) => void;
  onOpenOnboarding: () => void;
  onOpenCheck: (skillId: string) => void;
  refreshKey: number;
}) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api
        .dashboard()
        .then(setD)
        .catch((e) => setErr(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  if (err)
    return (
      <View style={s.err}>
        <Text style={s.text}>{err}</Text>
      </View>
    );
  if (!d) return <Text style={s.muted}>Loading your path...</Text>;
  const active =
    d.path.paths.find((p) => p.id === pathId) ??
    d.path.paths.find((p) => p.current) ??
    d.path.paths[0]!;
  const units = d.path.units.filter((u) => active.unitIds.includes(u.id));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
        <Text style={s.h2}>🔥 {d.streak.displayed}</Text>
        <Text style={s.h2}>⚡ {d.totalXp} XP</Text>
        <Text style={s.h2}>🏅 Lv {d.level}</Text>
      </View>
      <Bar pct={(d.xpIntoLevel / d.xpForNextLevel) * 100} label="XP to next level" />
      {!d.profile ? (
        <Card>
          <Text style={{ color: c.text, fontWeight: "900" }}>Make this path yours</Text>
          <Text style={s.muted}>
            Answer a few questions and we will shape your path, daily goal and starting point.
          </Text>
          <Button title="Personalize" onPress={onOpenOnboarding} />
        </Card>
      ) : null}
      {d.comeback ? (
        <Card>
          <Text accessibilityLiveRegion="polite" style={{ color: c.text, fontWeight: "900" }}>
            Welcome back! 👋
          </Text>
          <Text style={s.muted}>
            It has been {d.comeback.daysAway} days. Your progress is exactly where you left it. One
            short exercise is enough to get going again.
          </Text>
          {d.path.nextLessonId ? (
            <Button
              title="Pick up where you left off"
              onPress={() => onOpenLesson(d.path.nextLessonId!)}
            />
          ) : null}
        </Card>
      ) : null}
      {d.plan ? (
        <Card>
          <Text style={{ color: c.text, fontWeight: "900" }}>Your plan</Text>
          <Text style={s.text}>{d.plan.headline}</Text>
          {d.plan.focusLessonId ? (
            <Button
              title="Start with a lesson for your goals"
              onPress={() => onOpenLesson(d.plan!.focusLessonId!)}
            />
          ) : null}
          <Button title="Edit my plan" kind="secondary" onPress={onOpenOnboarding} />
          {d.plan.placementOffers.length > 0 ? (
            <>
              <Text style={s.muted}>
                Already know these? A short check lets you skip ahead. You still earn mastery by
                practising.
              </Text>
              {d.plan.placementOffers.map((id) => (
                <Button
                  key={id}
                  title={`Skip check: ${d.skillNames[id]}`}
                  kind="secondary"
                  onPress={() => onOpenCheck(id)}
                />
              ))}
            </>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Text style={{ color: c.text, fontWeight: "900" }}>
          Today{" "}
          <Text style={s.muted}>
            {d.dailyGoal.met
              ? "Daily goal reached 🎉"
              : `${d.dailyGoal.todayXp} / ${d.dailyGoal.targetXp} XP`}
          </Text>
        </Text>
        <Bar
          pct={Math.min(100, (d.dailyGoal.todayXp / d.dailyGoal.targetXp) * 100)}
          label="Daily goal"
        />
        <Text style={s.muted}>
          This week: {d.weekly.xp} XP · {d.weekly.activeDays} active{" "}
          {d.weekly.activeDays === 1 ? "day" : "days"}
        </Text>
      </Card>
      <Text style={[s.h2, { marginTop: 16 }]} accessibilityRole="header">
        Learning paths
      </Text>
      {d.path.paths.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: p.id === active.id }}
          accessibilityLabel={`${p.title}. ${p.lessonsDone} of ${p.lessonsTotal} lessons complete${p.current ? ". You are here" : ""}`}
          onPress={() => setPathId(p.id)}
          style={{ marginTop: 8, opacity: p.id === active.id ? 1 : 0.7 }}
        >
          <Card>
            <Text style={{ color: c.text, fontWeight: "900" }}>
              {p.current ? "📍 " : ""}
              {p.title}
            </Text>
            <Text style={s.muted}>{p.blurb}</Text>
            <Bar
              pct={p.lessonsTotal ? (p.lessonsDone / p.lessonsTotal) * 100 : 0}
              label={`${p.title} progress`}
            />
          </Card>
        </Pressable>
      ))}
      {units.map((u) => (
        <View key={u.id}>
          <View style={{ backgroundColor: c.violet, borderRadius: 16, padding: 12, marginTop: 22 }}>
            <Text
              style={{ color: "white", fontWeight: "900", fontSize: 16 }}
              accessibilityRole="header"
            >
              {u.title}
            </Text>
          </View>
          {u.lessons.map((l, i) => {
            const locked = l.status === "locked";
            const bg = l.status === "complete" ? c.sun : locked ? "#3a3470" : c.mint;
            return (
              <View
                key={l.id}
                style={{
                  alignItems: "center",
                  marginVertical: 14,
                  transform: [{ translateX: [0, 40, 0, -40][i % 4]! }],
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: locked }}
                  accessibilityLabel={`${l.kind === "lesson" ? "" : l.kind === "debug_challenge" ? "Debugging case: " : "Guided project: "}${l.title}. ${locked ? "Locked" : `${l.passed} of ${l.total} done`}`}
                  disabled={locked}
                  onPress={() => onOpenLesson(l.id)}
                  style={({ pressed }) => ({
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    backgroundColor: bg,
                    alignItems: "center",
                    justifyContent: "center",
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                    borderBottomWidth: 7,
                    borderBottomColor: "rgba(0,0,0,0.3)",
                  })}
                >
                  <Text style={{ fontSize: 30, color: c.ink }}>
                    {l.status === "complete"
                      ? "★"
                      : locked
                        ? "🔒"
                        : l.kind === "debug_challenge"
                          ? "🐞"
                          : l.kind === "guided_project"
                            ? "🛠"
                            : "▶"}
                  </Text>
                </Pressable>
                <Text
                  style={{ color: c.text, fontWeight: "800", marginTop: 6, textAlign: "center" }}
                >
                  {l.title}
                </Text>
                <Text style={s.muted}>
                  {locked ? "Reach Beginner in earlier skills" : `${l.passed}/${l.total} exercises`}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      {d.path.units.some((u) => u.lessons.some((l) => l.passed > 0)) ? (
        <Button
          title="Practice your weakest skills"
          kind="secondary"
          onPress={() => onOpenLesson("practice")}
        />
      ) : null}
      <Text style={[s.h2, { marginTop: 16 }]}>Quests</Text>
      {d.quests.map((q) => (
        <Card key={q.id}>
          <Text style={s.text}>
            {q.name} · {q.period}
          </Text>
          <Text style={s.muted}>
            {q.description} {q.complete ? "Done - reward earned." : `+${q.rewardXp} XP`}
          </Text>
          <Bar pct={(q.progress / q.target) * 100} label={`${q.name} progress`} />
        </Card>
      ))}
      <Text style={[s.h2, { marginTop: 16 }]}>Your skills</Text>
      {d.path.skills.map((k) => (
        <Card key={k.skillId} style={{ opacity: k.unlocked ? 1 : 0.6 }}>
          <Text style={s.text}>{d.skillNames[k.skillId]}</Text>
          <Text style={s.muted}>
            {k.unlocked ? (k.level === "none" ? "Not started" : k.level) : "Locked"}
          </Text>
          <Bar pct={k.progressToNext * 100} label={`${d.skillNames[k.skillId]} progress`} />
        </Card>
      ))}
      <Text style={[s.h2, { marginTop: 12 }]}>Achievements</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {d.achievements.map((a) => (
          <Badge
            key={a.id}
            text={`${a.earned ? "🏆" : "🔒"} ${a.name}`}
            tone={a.earned ? "warn" : "muted"}
          />
        ))}
      </View>
    </ScrollView>
  );
}
