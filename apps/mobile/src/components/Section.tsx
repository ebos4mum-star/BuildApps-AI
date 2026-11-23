import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Badge, Card, s } from "./ui";
import { c } from "../theme";

/** Collapsible section so a long workspace stays usable on a phone. */
export function Section({
  title,
  badge,
  open: initial = false,
  children,
}: {
  title: string;
  badge?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <Text style={[s.h2, { flex: 1, marginVertical: 0 }]}>{title}</Text>
        {badge ? <Badge text={badge} tone="warn" /> : null}
        <Text style={{ color: c.muted, fontSize: 18, marginLeft: 8 }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </Card>
  );
}
