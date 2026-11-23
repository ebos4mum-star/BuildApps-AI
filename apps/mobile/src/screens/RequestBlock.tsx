import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import type { HandoffScope, RequestView } from "@buildapps/api-client";
import { Badge, Button, s } from "../components/ui";
import { api } from "../lib/session";
import { c } from "../theme";

const SCOPES: { id: HandoffScope; label: string }[] = [
  { id: "view_project", label: "Project overview & milestones" },
  { id: "view_scans", label: "Scan assessments" },
  { id: "view_findings", label: "Findings" },
  { id: "view_verification", label: "Verification results" },
];
const REQUEST_TEXT: Record<string, string> = {
  submitted: "Waiting to be matched with a vetted expert",
  matched: "Matched - expert reviewing",
  in_progress: "In progress",
  delivered: "Delivered - review the work",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type Act = <T>(fn: () => Promise<T>, done?: (r: T) => string) => Promise<void>;

/**
 * One expert request for the owner: status, expert, scoped time-limited handoff, job milestones,
 * completion/cancellation and activity. Shared by rescue help and the Publishing Center.
 */
export function RequestBlock({
  requestId,
  act,
  busy,
  version,
}: {
  requestId: string;
  act: Act;
  busy: boolean;
  version?: string;
}) {
  const [view, setView] = useState<RequestView | null>(null);
  const [scopes, setScopes] = useState<HandoffScope[]>(["view_project", "view_findings"]);
  const [days, setDays] = useState(7);
  const [reject, setReject] = useState<{ job: string; note: string } | null>(null);
  const load = useCallback(async () => setView(await api.myRequest(requestId)), [requestId]);
  useEffect(() => {
    load().catch(() => setView(null));
  }, [load, version]);
  const run: Act = async (fn, done) => {
    await act(fn, done);
    await load();
  };
  if (!view) return <Text style={s.muted}>Loading...</Text>;
  return (
    <View>
      <Text style={s.text}>{REQUEST_TEXT[view.request.status]}</Text>
      <Text style={s.muted}>{view.request.summary}</Text>
      {view.expert ? (
        <Text style={[s.text, { marginTop: 6 }]}>
          Expert: {view.expert.displayName}
          {view.expert.headline ? ` - ${view.expert.headline}` : ""}
        </Text>
      ) : null}

      {view.request.status === "matched" || view.request.status === "in_progress" ? (
        view.handoff ? (
          <View>
            <Text style={[s.text, { marginTop: 8 }]}>
              Access granted until {new Date(view.handoff.expiresAt).toLocaleString()}:{" "}
              {view.handoff.scopes.join(", ")}
            </Text>
            <Button
              title="Revoke access now"
              kind="danger"
              disabled={busy}
              onPress={() => run(() => api.revokeHandoff(view.request.id))}
            />
          </View>
        ) : (
          <View>
            <Text style={[s.label]}>
              Choose what your expert may see (never source code or credentials)
            </Text>
            {SCOPES.map((sc) => (
              <Pressable
                key={sc.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: scopes.includes(sc.id) }}
                onPress={() =>
                  setScopes(
                    scopes.includes(sc.id) ? scopes.filter((x) => x !== sc.id) : [...scopes, sc.id],
                  )
                }
                style={{ paddingVertical: 8 }}
              >
                <Text style={s.text}>
                  {scopes.includes(sc.id) ? "☑" : "☐"} {sc.label}
                </Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {[1, 3, 7, 14, 30].map((d) => (
                <Button
                  key={d}
                  title={`${d}d`}
                  kind={days === d ? "primary" : "secondary"}
                  onPress={() => setDays(d)}
                />
              ))}
            </View>
            <Button
              title={`Grant access for ${days} day${days > 1 ? "s" : ""}`}
              disabled={busy || scopes.length === 0}
              onPress={() => run(() => api.grantHandoff(view.request.id, scopes, days))}
            />
          </View>
        )
      ) : null}

      {view.jobs.map((j) => (
        <View key={j.id} style={{ borderTopColor: c.line, borderTopWidth: 1, paddingVertical: 8 }}>
          <Text style={s.text}>
            {j.title} <Badge text={j.status} tone={j.status === "accepted" ? "ok" : "muted"} />
          </Text>
          {j.deliverableNote ? <Text style={s.muted}>Deliverable: {j.deliverableNote}</Text> : null}
          {j.deliverableUrl ? (
            <Text style={{ color: c.sky }} onPress={() => void Linking.openURL(j.deliverableUrl!)}>
              {j.deliverableUrl}
            </Text>
          ) : null}
          {j.decisionNote ? <Text style={s.muted}>Your note: {j.decisionNote}</Text> : null}
          {j.status === "submitted" ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Button
                title="Accept"
                onPress={() => run(() => api.decideJob(view.request.id, j.id, "accept"))}
                style={{ flex: 1 }}
              />
              <Button
                title="Needs changes"
                kind="secondary"
                onPress={() => setReject({ job: j.id, note: "" })}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}
          {reject?.job === j.id ? (
            <View>
              <TextInput
                accessibilityLabel="What needs to change?"
                style={s.input}
                placeholder="What needs to change?"
                placeholderTextColor="#6b64a8"
                value={reject.note}
                onChangeText={(t) => setReject({ job: j.id, note: t })}
              />
              <Button
                title="Send feedback"
                disabled={!reject.note.trim()}
                onPress={() =>
                  void run(async () => {
                    await api.decideJob(view.request.id, j.id, "reject", reject.note);
                    setReject(null);
                  })
                }
              />
            </View>
          ) : null}
        </View>
      ))}

      {view.request.status === "delivered" ? (
        <Button
          title="Confirm job complete"
          disabled={busy || view.jobs.some((j) => j.status !== "accepted")}
          onPress={() => run(() => api.completeRequest(view.request.id))}
        />
      ) : null}
      {["submitted", "matched", "in_progress"].includes(view.request.status) ? (
        <Button
          title="Cancel request"
          kind="secondary"
          disabled={busy}
          onPress={() =>
            Alert.alert("Cancel this request?", "Any expert access is revoked.", [
              { text: "Keep", style: "cancel" },
              {
                text: "Cancel request",
                style: "destructive",
                onPress: () => void run(() => api.cancelRequest(view.request.id)),
              },
            ])
          }
        />
      ) : null}

      {view.events.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.label}>Job activity</Text>
          {view.events.map((e) => (
            <Text key={e.id} style={s.muted}>
              • {e.action.replace(/_/g, " ")} ({e.actorRole}){" "}
              {new Date(e.createdAt).toLocaleDateString()}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
