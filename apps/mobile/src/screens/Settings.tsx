import { useCallback, useEffect, useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@buildapps/core";
import type { NotificationPrefs } from "@buildapps/api-client";
import { Button, s } from "../components/ui";
import { Section } from "../components/Section";
import { api } from "../lib/session";
import { PrivacySection } from "./Privacy";

const LABEL: Record<NotificationCategory, string> = {
  learning_reminder: "Practice reminders",
  weekly_summary: "Weekly summary",
  project: "Project updates",
  support: "Support replies",
  expert: "Expert help updates",
  publishing: "Publishing updates",
  security: "Account and security (always on)",
};

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 48,
      }}
    >
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  );
}

/** Profile, notification preferences, privacy: the same settings as the web, backed by the same account. */
export function SettingsScreen({ onEditPlan }: { onEditPlan: () => void }) {
  const [name, setName] = useState("");
  const [tz, setTz] = useState("UTC");
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [providers, setProviders] = useState<{ push: string | null; email: string | null } | null>(
    null,
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const v = await api.account();
    setName(v.account.displayName ?? "");
    setTz(v.account.timeZone);
    setPrefs(v.notifications);
    setProviders(v.providers);
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  async function run(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={s.h1} accessibilityRole="header">
        Settings
      </Text>
      {err ? (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {msg ? (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
      <Section title="Profile" open>
        <Text style={s.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          style={s.input}
          value={name}
          maxLength={60}
          onChangeText={setName}
        />
        <Text style={s.label}>Time zone (for streaks, goals and reminders)</Text>
        <TextInput
          accessibilityLabel="Time zone"
          style={s.input}
          value={tz}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setTz}
        />
        <Button
          title="Save profile"
          onPress={() =>
            void run(
              () => api.updateAccount({ displayName: name.trim() || null, timeZone: tz.trim() }),
              "Profile saved.",
            )
          }
        />
        <Button title="Edit my learning plan" kind="secondary" onPress={onEditPlan} />
      </Section>
      {prefs ? (
        <Section title="Notifications">
          <Text style={s.muted}>
            In-app notifications are always on. Push and email are optional and stay off until you
            choose.
            {providers && !providers.push && !providers.email
              ? " Delivery is not enabled on this server yet, so choices take effect once it is."
              : ""}
          </Text>
          <Toggle
            label="Push notifications"
            value={prefs.push}
            onChange={(push) => setPrefs({ ...prefs, push })}
          />
          <Toggle
            label="Email"
            value={prefs.email}
            onChange={(email) => setPrefs({ ...prefs, email })}
          />
          {NOTIFICATION_CATEGORIES.map((c) => (
            <Toggle
              key={c}
              label={LABEL[c]}
              value={prefs.categories[c]}
              disabled={c === "security"}
              onChange={(v) => setPrefs({ ...prefs, categories: { ...prefs.categories, [c]: v } })}
            />
          ))}
          <Toggle
            label="Quiet hours (22:00 to 07:00, no push)"
            value={!!prefs.quietHours}
            onChange={(on) => setPrefs({ ...prefs, quietHours: on ? { start: 22, end: 7 } : null })}
          />
          <Button
            title="Save notification preferences"
            onPress={() =>
              void run(() => api.saveNotificationPrefs(prefs), "Notification preferences saved.")
            }
          />
        </Section>
      ) : null}
      <PrivacySection />
    </ScrollView>
  );
}
