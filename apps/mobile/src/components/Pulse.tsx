import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useReduceMotion } from "./ui";

/** A soft expanding ring behind the current lesson. Static when the OS asks to reduce motion. */
export function Pulse({ color, children }: { color: string; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, reduce]);
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      {!reduce && (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          }}
        />
      )}
      {children}
    </View>
  );
}
