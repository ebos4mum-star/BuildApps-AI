import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import type {
  ExpertRequestDetail,
  ExpertRow,
  ExpertWorkspaceView,
  ServiceRequestRow,
} from "@buildapps/api-client";
import { Badge, Button, Card, s } from "../components/ui";
import { api } from "../lib/session";
import { c } from "../theme";

const STATUS: Record<string, string> = {
  matched: "New match - review and accept",
  in_progress: "In progress",
  delivered: "Delivered - awaiting owner review",
  completed: "Completed",
  submitted: "Returned to pool",
  cancelled: "Cancelled",
};

/** Expert side of Human Developer Rescue, adapted for a phone: apply, accept, submit work, deliver. */
export function ExpertScreen() {
  const [profile, setProfile] = useState<ExpertRow | null | undefined>(undefined);
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: "", headline: "", skills: "" });
  const load = useCallback(async () => {
    const p = await api.expertProfile();
    setProfile(p);
    if (p) {
      setForm({
        displayName: p.displayName,
        headline: p.headline ?? "",
        skills: p.skills.join(", "),
      });
      if (p.status === "approved") setRequests(await api.expertRequests());
    }
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  if (profile === undefined)
    return <Text style={[s.muted, { padding: 16 }]}>{err ?? "Loading..."}</Text>;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.h1} accessibilityRole="header">
        Expert workspace
      </Text>
      <Text style={s.muted}>
        Vetted developers help people finish stuck projects. An administrator approves applications
        before you can be matched.
      </Text>
      {err ? (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      <Card>
        <Text style={s.h2}>
          {profile ? "Your expert profile" : "Apply to become an expert"}{" "}
          {profile ? (
            <Badge text={profile.status} tone={profile.status === "approved" ? "ok" : "warn"} />
          ) : null}
        </Text>
        {profile?.reviewNote ? (
          <Text style={s.muted}>Reviewer note: {profile.reviewNote}</Text>
        ) : null}
        <Text style={s.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          style={s.input}
          value={form.displayName}
          onChangeText={(x) => setForm({ ...form, displayName: x })}
        />
        <Text style={s.label}>Headline</Text>
        <TextInput
          accessibilityLabel="Headline"
          style={s.input}
          value={form.headline}
          onChangeText={(x) => setForm({ ...form, headline: x })}
        />
        <Text style={s.label}>Skills (comma separated)</Text>
        <TextInput
          accessibilityLabel="Skills"
          style={s.input}
          autoCapitalize="none"
          value={form.skills}
          onChangeText={(x) => setForm({ ...form, skills: x })}
        />
        <Button
          title={profile ? "Update profile" : "Submit application"}
          disabled={!form.displayName.trim()}
          onPress={async () => {
            setErr(null);
            try {
              await api.saveExpertProfile({
                displayName: form.displayName,
                ...(form.headline ? { headline: form.headline } : {}),
                skills: form.skills
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              });
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            }
          }}
        />
      </Card>
      {profile?.status === "approved" ? (
        <>
          <Text style={s.h2}>Your jobs</Text>
          {requests.length === 0 ? <Text style={s.muted}>No jobs matched to you yet.</Text> : null}
          {requests.map((r) => (
            <Card key={r.id}>
              <Badge text={`${r.kind} - ${STATUS[r.status] ?? r.status}`} tone="warn" />
              <Text style={[s.text, { marginVertical: 6 }]}>{r.summary}</Text>
              <Button
                title={open === r.id ? "Close" : "Open job"}
                kind="secondary"
                onPress={() => setOpen(open === r.id ? null : r.id)}
              />
              {open === r.id ? <Job id={r.id} onChange={load} /> : null}
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function Job({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [d, setD] = useState<ExpertRequestDetail | null>(null);
  const [w, setW] = useState<ExpertWorkspaceView | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sub, setSub] = useState<{ job: string; note: string; url: string } | null>(null);
  const load = useCallback(async () => {
    setD(await api.expertRequest(id));
    api
      .expertWorkspace(id)
      .then((x) => {
        setW(x);
        setWErr(null);
      })
      .catch((e) => {
        setW(null);
        setWErr(e.message);
      });
  }, [id]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await load();
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  if (!d) return <Text style={s.muted}>Loading...</Text>;
  const st = d.request.status;
  return (
    <View style={{ marginTop: 8 }}>
      {err ? (
        <View style={s.err}>
          <Text style={s.text}>{err}</Text>
        </View>
      ) : null}
      {st === "matched" ? (
        <>
          <Button title="Accept job" onPress={() => void act(() => api.expertAct(id, "accept"))} />
          <Button
            title="Decline"
            kind="secondary"
            onPress={() => void act(() => api.expertAct(id, "decline"))}
          />
        </>
      ) : null}
      {st === "in_progress" ? (
        <Button
          title="Mark delivered"
          onPress={() => void act(() => api.expertAct(id, "deliver"))}
        />
      ) : null}

      <Text style={s.label}>Project access</Text>
      {w ? (
        <View>
          <Text style={s.muted}>
            Granted until {new Date(w.handoff.expiresAt).toLocaleString()}:{" "}
            {w.handoff.scopes.join(", ")}. Summaries only - never source code or credentials.
          </Text>
          {w.project ? (
            <Text style={s.text}>
              {w.project.name} ({w.project.journey}, {w.project.state})
            </Text>
          ) : null}
          {w.findings
            ?.filter((f) => f.status !== "resolved")
            .slice(0, 8)
            .map((f) => (
              <Text key={f.id} style={s.muted}>
                • [{f.severity}] {f.title}
              </Text>
            ))}
          {w.publishing?.targets.map((t) => (
            <Text key={t.target.id} style={s.muted}>
              • {t.target.platform.replace(/_/g, " ")}:{" "}
              {t.readiness.readyToSubmit ? "ready to submit" : "not ready"} (
              {t.readiness.counts.missing} missing, {t.readiness.counts.blocked} blocked)
            </Text>
          ))}
        </View>
      ) : (
        <Text style={s.muted}>{wErr ?? "No access granted."}</Text>
      )}

      <Text style={s.label}>Job milestones</Text>
      {d.jobs.map((j) => (
        <View key={j.id} style={{ paddingVertical: 6, borderTopColor: c.line, borderTopWidth: 1 }}>
          <Text style={s.text}>
            {j.title} <Badge text={j.status} tone={j.status === "accepted" ? "ok" : "muted"} />
          </Text>
          {j.decisionNote ? <Text style={s.muted}>Owner feedback: {j.decisionNote}</Text> : null}
          {st === "in_progress" && (j.status === "todo" || j.status === "rejected") ? (
            <Button
              title="Submit work"
              kind="secondary"
              onPress={() => setSub({ job: j.id, note: "", url: "" })}
            />
          ) : null}
          {sub?.job === j.id ? (
            <View>
              <TextInput
                accessibilityLabel="What did you do?"
                style={[s.input, { minHeight: 70, textAlignVertical: "top" }]}
                multiline
                placeholder="What did you do?"
                placeholderTextColor="#6b64a8"
                value={sub.note}
                onChangeText={(x) => setSub({ ...sub, note: x })}
              />
              <TextInput
                accessibilityLabel="Link (https, optional)"
                style={s.input}
                autoCapitalize="none"
                placeholder="Link to the work (https, optional)"
                placeholderTextColor="#6b64a8"
                value={sub.url}
                onChangeText={(x) => setSub({ ...sub, url: x })}
              />
              <Button
                title="Submit for owner review"
                disabled={sub.note.trim().length < 5}
                onPress={() =>
                  void act(async () => {
                    await api.expertSubmitJob(id, j.id, sub.note, sub.url || undefined);
                    setSub(null);
                  })
                }
              />
            </View>
          ) : null}
        </View>
      ))}
      {st === "matched" || st === "in_progress" ? (
        <View>
          <TextInput
            accessibilityLabel="Add a milestone"
            style={s.input}
            placeholder="Add a milestone"
            placeholderTextColor="#6b64a8"
            value={title}
            onChangeText={setTitle}
          />
          <Button
            title="Add milestone"
            kind="secondary"
            disabled={!title.trim()}
            onPress={() =>
              void act(async () => {
                await api.expertAddJob(id, title);
                setTitle("");
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}
