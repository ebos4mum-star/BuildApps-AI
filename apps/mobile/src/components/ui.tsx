import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { c } from "../theme";

export function useReduceMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setR)
      .catch(() => undefined);
  }, []);
  return r;
}

export function Button({
  title,
  onPress,
  disabled,
  kind = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger";
  style?: ViewStyle;
}) {
  const bg = disabled
    ? "#3a3470"
    : kind === "primary"
      ? c.mint
      : kind === "danger"
        ? c.coral
        : c.surface2;
  const fg = disabled ? "#8f89c4" : kind === "secondary" ? c.text : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, transform: [{ translateY: pressed ? 3 : 0 }] },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[s.card, style]}>{children}</View>
);
export const Badge = ({
  text,
  tone = "muted",
}: {
  text: string;
  tone?: "muted" | "ok" | "warn" | "verified";
}) => (
  <Text
    style={[s.badge, { color: { muted: c.muted, ok: c.mint, warn: c.sun, verified: c.sky }[tone] }]}
  >
    {text.toUpperCase()}
  </Text>
);
export const Bar = ({ pct, label }: { pct: number; label: string }) => (
  <View
    style={s.bar}
    accessibilityRole="progressbar"
    accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
  >
    <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
  </View>
);

export const s = StyleSheet.create({
  btn: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginVertical: 4,
  },
  btnText: { fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase", fontSize: 15 },
  card: {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginVertical: 6,
  },
  badge: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  bar: {
    height: 14,
    backgroundColor: "#120e2b",
    borderRadius: 999,
    borderColor: c.line,
    borderWidth: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: c.mint, borderRadius: 999 },
  h1: { color: c.text, fontSize: 26, fontWeight: "900", marginBottom: 6 },
  h2: { color: c.text, fontSize: 20, fontWeight: "900", marginVertical: 6 },
  text: { color: c.text, fontSize: 16 },
  muted: { color: c.muted, fontSize: 14 },
  input: {
    backgroundColor: "#120e2b",
    borderColor: c.line,
    borderWidth: 2,
    borderRadius: 12,
    color: c.text,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  label: { color: c.text, fontWeight: "800", marginBottom: 4, marginTop: 6 },
  err: {
    backgroundColor: "#43202c",
    borderColor: c.coral,
    borderWidth: 2,
    borderRadius: 12,
    padding: 10,
    marginVertical: 8,
  },
});
