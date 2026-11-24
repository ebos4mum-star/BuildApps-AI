import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { ExpertRow, ServiceRequestRow } from "@buildapps/api-client";
import { Badge, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { AdminOps } from "./AdminOps";

/** Quick-action administration for a phone: vet experts and match requests. Detailed review stays on web. */
export function AdminScreen() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [experts, setExperts] = useState<ExpertRow[]>([]);
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const a = await api.adminMe();
    setAdmin(a);
    if (a) {
      setExperts(await api.adminExperts());
      setRequests(await api.adminRequests());
    }
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };

  if (admin === null) return <Text style={[s.muted, { padding: 16 }]}>{err ?? "Loading..."}</Text>;
  if (!admin)
    return (
      <View style={{ padding: 16 }}>
        <Card>
          <Text style={s.h2}>Administration</Text>
          <Text style={s.muted}>This area is for BuildApps administrators.</Text>
        </Card>
      </View>
    );
  const approved = experts.filter((e) => e.status === "approved");
  const name = (id: string | null) => experts.find((e) => e.id === id)?.displayName ?? "-";
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.h1} accessibilityRole="header">
        Administration
      </Text>
      {err ? (
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      <AdminOps />
      <Text style={s.h2}>Expert applications</Text>
      {experts.length === 0 ? <Text style={s.muted}>No applications yet.</Text> : null}
      {experts.map((e) => (
        <Card key={e.id}>
          <Text style={s.text}>
            {e.displayName} <Badge text={e.status} tone={e.status === "approved" ? "ok" : "warn"} />
          </Text>
          {e.headline ? <Text style={s.muted}>{e.headline}</Text> : null}
          {e.skills.length ? <Text style={s.muted}>Skills: {e.skills.join(", ")}</Text> : null}
          {e.status !== "approved" ? (
            <Button
              title="Approve"
              onPress={() => void act(() => api.adminReviewExpert(e.id, "approved"))}
            />
          ) : null}
          {e.status === "pending" ? (
            <Button
              title="Reject"
              kind="danger"
              onPress={() => void act(() => api.adminReviewExpert(e.id, "rejected"))}
            />
          ) : null}
          {e.status === "approved" ? (
            <Button
              title="Suspend (revokes access)"
              kind="danger"
              onPress={() => void act(() => api.adminReviewExpert(e.id, "suspended"))}
            />
          ) : null}
        </Card>
      ))}
      <Text style={s.h2}>Service requests</Text>
      {requests.map((r) => (
        <Card key={r.id}>
          <Text style={s.text}>
            <Badge text={`${r.kind} - ${r.status.replace("_", " ")}`} tone="warn" />{" "}
            {r.assignedExpertId ? `expert: ${name(r.assignedExpertId)}` : ""}
          </Text>
          <Text style={[s.text, { marginVertical: 4 }]}>{r.summary}</Text>
          {r.status === "submitted" ? (
            approved.length === 0 ? (
              <Text style={s.muted}>Approve an expert to match this request.</Text>
            ) : (
              <View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {approved.map((e) => (
                    <Button
                      key={e.id}
                      title={e.displayName}
                      kind={(pick[r.id] ?? approved[0]!.id) === e.id ? "primary" : "secondary"}
                      onPress={() => setPick({ ...pick, [r.id]: e.id })}
                    />
                  ))}
                </View>
                <Button
                  title="Match expert"
                  onPress={() =>
                    void act(() => api.adminMatch(r.id, pick[r.id] ?? approved[0]!.id))
                  }
                />
              </View>
            )
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}
