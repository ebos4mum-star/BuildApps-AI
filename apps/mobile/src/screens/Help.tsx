import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import type {
  NotificationRow,
  ReportReason,
  ReportTarget,
  SupportCategory,
  SupportRow,
} from "@buildapps/api-client";
import { Badge, Button, Card, s } from "../components/ui";
import { Section } from "../components/Section";
import { api } from "../lib/session";
import { PrivacySection } from "./Privacy";
import { c } from "../theme";

const CATEGORIES: SupportCategory[] = [
  "account",
  "learning",
  "project",
  "expert",
  "publishing",
  "other",
];
const REASONS: ReportReason[] = [
  "spam",
  "harassment",
  "unsafe_content",
  "impersonation",
  "fraud",
  "other",
];
const TARGETS: ReportTarget[] = ["user", "expert", "project", "request"];

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityLabel={label}>
      <Text style={s.muted}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 }}>
        {options.map((o) => (
          <Button
            key={o}
            title={o.replace("_", " ")}
            kind={o === value ? "primary" : "secondary"}
            onPress={() => onChange(o)}
          />
        ))}
      </View>
    </View>
  );
}

/** Notifications, support requests and abuse reporting for every signed-in user. */
export function HelpScreen({ onUnread }: { onUnread: (n: number) => void }) {
  const [mine, setMine] = useState<SupportRow[]>([]);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "other" as SupportCategory, subject: "", body: "" });
  const [rep, setRep] = useState({
    targetType: "expert" as ReportTarget,
    targetId: "",
    reason: "spam" as ReportReason,
    detail: "",
  });
  const load = useCallback(async () => {
    const [m, n] = await Promise.all([api.mySupport(), api.notifications()]);
    setMine(m);
    setNotes(n);
    onUnread(n.filter((x) => !x.readAt).length);
  }, [onUnread]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.h1} accessibilityRole="header">
        Help &amp; notifications
      </Text>
      {err ? (
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {msg ? <Text style={[s.muted, { color: c.mint }]}>{msg}</Text> : null}

      <Section title="Notifications" badge={`${notes.filter((n) => !n.readAt).length} new`} open>
        {notes.length === 0 ? <Text style={s.muted}>Nothing new.</Text> : null}
        {notes.map((n) => (
          <Text key={n.id} style={[s.text, { marginVertical: 3 }]}>
            {!n.readAt ? "● " : ""}
            {n.title}
            {n.body ? <Text style={s.muted}>{`\n${n.body}`}</Text> : null}
          </Text>
        ))}
        {notes.some((n) => !n.readAt) ? (
          <Button
            title="Mark all as read"
            kind="secondary"
            onPress={() => void run(() => api.markNotificationsRead("all"), "Marked as read.")}
          />
        ) : null}
      </Section>

      <Section title="Contact support" open>
        <Choice
          label="What is it about?"
          options={CATEGORIES}
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
        />
        <TextInput
          accessibilityLabel="Subject"
          style={s.input}
          placeholder="Subject"
          value={form.subject}
          maxLength={120}
          onChangeText={(subject) => setForm({ ...form, subject })}
        />
        <TextInput
          accessibilityLabel="Details"
          style={[s.input, { minHeight: 90 }]}
          placeholder="Details (never include passwords or keys)"
          multiline
          value={form.body}
          maxLength={4000}
          onChangeText={(body) => setForm({ ...form, body })}
        />
        <Button
          title="Send"
          onPress={() =>
            void run(async () => {
              await api.createSupport(form);
              setForm({ ...form, subject: "", body: "" });
            }, "Thanks - your request was sent.")
          }
        />
      </Section>

      <Section title="Your requests" badge={`${mine.length}`}>
        {mine.length === 0 ? <Text style={s.muted}>No requests yet.</Text> : null}
        {mine.map((r) => (
          <Card key={r.id}>
            <Text style={s.text}>
              <Badge text={r.status.replace("_", " ")} tone="warn" /> {r.subject}
            </Text>
            {r.adminNote ? <Text style={s.muted}>Reply: {r.adminNote}</Text> : null}
          </Card>
        ))}
      </Section>

      <Section title="Report abuse">
        <Choice
          label="What are you reporting?"
          options={TARGETS}
          value={rep.targetType}
          onChange={(targetType) => setRep({ ...rep, targetType })}
        />
        <TextInput
          accessibilityLabel="Id of what you are reporting"
          style={s.input}
          placeholder="Its id"
          autoCapitalize="none"
          value={rep.targetId}
          onChangeText={(targetId) => setRep({ ...rep, targetId })}
        />
        <Choice
          label="Reason"
          options={REASONS}
          value={rep.reason}
          onChange={(reason) => setRep({ ...rep, reason })}
        />
        <TextInput
          accessibilityLabel="Details"
          style={[s.input, { minHeight: 70 }]}
          placeholder="Details (optional)"
          multiline
          value={rep.detail}
          onChangeText={(detail) => setRep({ ...rep, detail })}
        />
        <Button
          title="Submit report"
          kind="danger"
          onPress={() =>
            void run(async () => {
              await api.reportAbuse({
                targetType: rep.targetType,
                targetId: rep.targetId,
                reason: rep.reason,
                ...(rep.detail ? { detail: rep.detail } : {}),
              });
              setRep({ ...rep, targetId: "", detail: "" });
            }, "Report received.")
          }
        />
      </Section>
      <PrivacySection />
    </ScrollView>
  );
}
