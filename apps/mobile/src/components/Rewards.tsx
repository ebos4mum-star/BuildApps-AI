import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { s, useReduceMotion } from "./ui";
import { c } from "../theme";

export interface RewardItem {
  kind: "achievement" | "skill" | "quest" | "goal";
  title: string;
}
const LABEL = {
  achievement: "Achievement unlocked",
  skill: "Skill level up",
  quest: "Quest complete",
  goal: "Daily goal reached",
} as const;

function Card({ item, index, reduce }: { item: RewardItem; index: number; reduce: boolean }) {
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.spring(v, {
      toValue: 1,
      delay: index * 140,
      useNativeDriver: true,
      bounciness: 10,
    }).start();
  }, [v, index, reduce]);
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${LABEL[item.kind]}: ${item.title}`}
      style={{
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 2,
        borderRadius: 18,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        alignSelf: "stretch",
      }}
    >
      <Text style={{ fontSize: 30 }} accessibilityElementsHidden>
        {item.kind === "skill" ? "📈" : item.kind === "quest" ? "🎯" : "🏆"}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.muted, { color: c.sun, fontWeight: "900" }]}>{LABEL[item.kind]}</Text>
        <Text style={[s.text, { fontWeight: "900" }]}>{item.title}</Text>
      </View>
    </Animated.View>
  );
}

/** Earned rewards at the end of a lesson. Animation is skipped when the OS asks to reduce motion. */
export function Rewards({ items }: { items: RewardItem[] }) {
  const reduce = useReduceMotion();
  if (items.length === 0) return null;
  return (
    <View style={{ alignSelf: "stretch", gap: 10, marginTop: 14 }}>
      {items.map((it, i) => (
        <Card key={`${it.kind}-${it.title}`} item={it} index={i} reduce={reduce} />
      ))}
    </View>
  );
}
