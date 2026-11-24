import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Dashboard } from "@buildapps/api-client";
import { Badge, Bar, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { c } from "../theme";

export function LearnScreen({
  onOpenLesson,
  refreshKey,
}: {
  onOpenLesson: (id: string) => void;
  refreshKey: number;
}) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
        <Text style={s.h2}>🔥 {d.streak.displayed}</Text>
        <Text style={s.h2}>⚡ {d.totalXp} XP</Text>
        <Text style={s.h2}>🏅 Lv {d.level}</Text>
      </View>
      <Bar pct={(d.xpIntoLevel / d.xpForNextLevel) * 100} label="XP to next level" />
      {d.path.units.map((u) => (
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
                  accessibilityLabel={`${l.title}. ${locked ? "Locked" : `${l.passed} of ${l.total} done`}`}
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
                    {l.status === "complete" ? "★" : locked ? "🔒" : "▶"}
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
