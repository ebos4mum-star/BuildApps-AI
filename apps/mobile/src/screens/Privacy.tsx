import { useCallback, useEffect, useState } from "react";
import { Share, Text, TextInput } from "react-native";
import type { DeletionRequestRow } from "@buildapps/api-client";
import { Badge, Button, s } from "../components/ui";
import { Section } from "../components/Section";
import { api } from "../lib/session";

/** Data export (through the native share sheet) and account deletion with a cooling-off period. */
export function PrivacySection() {
  const [pending, setPending] = useState<DeletionRequestRow | null | undefined>(undefined);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.myDeletion().then(setPending), []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  async function act(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      setConfirm("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <Section title="Your data and privacy">
      {err ? (
        <Text style={s.text} accessibilityRole="alert">
          {err}
        </Text>
      ) : null}
      {msg ? (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
      <Text style={s.muted}>
        Get a copy of everything your account holds: progress, projects, help requests, support
        messages and notifications.
      </Text>
      <Button
        title="Export my data"
        kind="secondary"
        onPress={() =>
          void act(async () => {
            const data = await api.exportMyData();
            await Share.share({ message: JSON.stringify(data, null, 2), title: "BuildApps data" });
          }, "Export ready.")
        }
      />
      <Text style={[s.h2, { marginTop: 12 }]} accessibilityRole="header">
        Delete my account
      </Text>
      {pending === undefined ? (
        <Text style={s.muted}>Loading...</Text>
      ) : pending ? (
        <>
          <Badge text="Deletion requested" tone="warn" />
          <Text style={s.muted}>
            Your account can be erased after {new Date(pending.notBefore).toLocaleDateString()}.
            Until then you can change your mind.
          </Text>
          <Button
            title="Cancel deletion"
            kind="secondary"
            onPress={() => void act(() => api.cancelDeletion(), "Deletion cancelled.")}
          />
        </>
      ) : (
        <>
          <Text style={s.muted}>
            Erases your progress, projects and requests after a 14-day cooling-off period you can
            cancel. Type DELETE MY ACCOUNT to confirm.
          </Text>
          <TextInput
            style={s.input}
            accessibilityLabel="Type DELETE MY ACCOUNT to confirm"
            placeholder="DELETE MY ACCOUNT"
            autoCapitalize="characters"
            value={confirm}
            onChangeText={setConfirm}
          />
          <Button
            title="Request account deletion"
            kind="danger"
            onPress={() =>
              void act(
                () => api.requestDeletion({ confirm }),
                "Deletion requested. You can cancel during the cooling-off period.",
              )
            }
          />
        </>
      )}
    </Section>
  );
}
