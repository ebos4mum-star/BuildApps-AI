import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type {
  AbuseReportRow,
  AdminLesson,
  AdminOverview,
  AuditRow,
  DeletionRequestRow,
  HealthReport,
  SupportRow,
  UserSummary,
} from "@buildapps/api-client";
import { Badge, Button, Card, s } from "../components/ui";
import { Section } from "../components/Section";
import { api } from "../lib/session";

const when = (iso: string) => new Date(iso).toLocaleString();

function useOps<T>(load: () => Promise<T>, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  return { data, err, reload, setErr };
}
const ErrText = ({ msg }: { msg: string | null }) =>
  msg ? (
    <View style={s.err}>
      <Text style={s.text}>{msg}</Text>
    </View>
  ) : null;

/** Operations tools for administrators on a phone; the same server rules and audit trail apply. */
export function AdminOps() {
  return (
    <View>
      <OverviewSection />
      <HealthSection />
      <UsersSection />
      <SupportSection />
      <ReportsSection />
      <ContentSection />
      <PrivacySection />
      <AuditSection />
    </View>
  );
}

function OverviewSection() {
  const { data: o, err } = useOps<AdminOverview>(() => api.adminOverview(), true);
  return (
    <Section title="Overview" open>
      <ErrText msg={err} />
      {o ? (
        <View style={{ gap: 4 }}>
          <Text style={s.text}>
            Users {o.users} · suspended {o.suspendedUsers}
          </Text>
          <Text style={s.text}>
            Open support {o.openSupport} · abuse reports {o.openReports}
          </Text>
          <Text style={s.text}>
            Pending experts {o.pendingExperts} · awaiting match {o.awaitingMatch}
          </Text>
          <Text style={s.text}>Publishing assistance open {o.openPublishingAssistance}</Text>
        </View>
      ) : (
        <Text style={s.muted}>Loading...</Text>
      )}
    </Section>
  );
}

function UsersSection() {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const { data, err, reload, setErr } = useOps<UserSummary[]>(
    () => api.adminUsers(q || undefined),
    true,
  );
  const act = async (u: UserSummary, suspended: boolean) => {
    try {
      await api.adminSetSuspension(u.id, suspended, reason[u.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <Section title="Users" badge={data ? `${data.length}` : undefined}>
      <TextInput
        accessibilityLabel="Search users"
        style={s.input}
        value={q}
        onChangeText={setQ}
        placeholder="Search by name or id"
        autoCapitalize="none"
      />
      <Button title="Search" kind="secondary" onPress={() => void reload()} />
      <ErrText msg={err} />
      {data?.map((u) => (
        <Card key={u.id}>
          <Text style={s.text}>
            {u.displayName ?? "(no name)"}{" "}
            {u.suspended ? <Badge text="suspended" tone="warn" /> : null}
          </Text>
          <Text style={s.muted}>{u.id}</Text>
          {u.suspendedReason ? <Text style={s.muted}>Reason: {u.suspendedReason}</Text> : null}
          <TextInput
            accessibilityLabel="Reason"
            style={s.input}
            placeholder="Reason (required to suspend)"
            value={reason[u.id] ?? ""}
            onChangeText={(t) => setReason({ ...reason, [u.id]: t })}
          />
          {u.suspended ? (
            <Button title="Reinstate" onPress={() => void act(u, false)} />
          ) : (
            <Button title="Suspend account" kind="danger" onPress={() => void act(u, true)} />
          )}
        </Card>
      ))}
    </Section>
  );
}

function SupportSection() {
  const { data, err, reload, setErr } = useOps<SupportRow[]>(() => api.adminSupport(), true);
  const [note, setNote] = useState<Record<string, string>>({});
  const act = async (r: SupportRow, status: SupportRow["status"]) => {
    try {
      await api.adminUpdateSupport(r.id, status, note[r.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <Section
      title="Support requests"
      badge={data ? `${data.filter((r) => r.status === "open").length} open` : undefined}
    >
      <ErrText msg={err} />
      {data?.length === 0 ? <Text style={s.muted}>No support requests.</Text> : null}
      {data?.map((r) => (
        <Card key={r.id}>
          <Text style={s.text}>
            <Badge text={r.status.replace("_", " ")} tone="warn" /> {r.subject}
          </Text>
          <Text style={s.muted}>
            {r.category} · {when(r.createdAt)}
          </Text>
          <Text style={s.text}>{r.body}</Text>
          {r.status !== "resolved" && r.status !== "closed" ? (
            <View>
              <TextInput
                accessibilityLabel="Note to the user"
                style={s.input}
                placeholder="Note to the user (optional)"
                value={note[r.id] ?? ""}
                onChangeText={(t) => setNote({ ...note, [r.id]: t })}
              />
              {r.status === "open" ? (
                <Button
                  title="Start working"
                  kind="secondary"
                  onPress={() => void act(r, "in_progress")}
                />
              ) : null}
              <Button title="Resolve" onPress={() => void act(r, "resolved")} />
              <Button title="Close" kind="secondary" onPress={() => void act(r, "closed")} />
            </View>
          ) : null}
        </Card>
      ))}
    </Section>
  );
}

function ReportsSection() {
  const { data, err, reload, setErr } = useOps<AbuseReportRow[]>(() => api.adminReports(), true);
  const [note, setNote] = useState<Record<string, string>>({});
  const act = async (r: AbuseReportRow, status: "actioned" | "dismissed") => {
    try {
      await api.adminReviewReport(r.id, status, note[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <Section
      title="Abuse reports"
      badge={data ? `${data.filter((r) => r.status === "open").length} open` : undefined}
    >
      <ErrText msg={err} />
      {data?.length === 0 ? <Text style={s.muted}>No abuse reports.</Text> : null}
      {data?.map((r) => (
        <Card key={r.id}>
          <Text style={s.text}>
            <Badge text={r.status} tone="warn" /> {r.reason.replace("_", " ")} → {r.targetType}{" "}
            {r.targetId}
          </Text>
          {r.detail ? <Text style={s.muted}>{r.detail}</Text> : null}
          {r.reviewNote ? <Text style={s.muted}>Decision: {r.reviewNote}</Text> : null}
          {r.status === "open" ? (
            <View>
              <TextInput
                accessibilityLabel="Decision note"
                style={s.input}
                placeholder="Decision note (required)"
                value={note[r.id] ?? ""}
                onChangeText={(t) => setNote({ ...note, [r.id]: t })}
              />
              <Button title="Mark actioned" onPress={() => void act(r, "actioned")} />
              <Button title="Dismiss" kind="secondary" onPress={() => void act(r, "dismissed")} />
            </View>
          ) : null}
        </Card>
      ))}
    </Section>
  );
}

function ContentSection() {
  const { data, err, reload, setErr } = useOps<AdminLesson[]>(() => api.adminContent(), true);
  const [note, setNote] = useState<Record<string, string>>({});
  const act = async (l: AdminLesson, disabled: boolean) => {
    try {
      await api.adminSetLesson(l.id, disabled, note[l.id]);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <Section
      title="Learning content"
      badge={data ? `${data.filter((l) => l.disabled).length} withheld` : undefined}
    >
      <ErrText msg={err} />
      {data?.map((l) => (
        <Card key={l.id}>
          <Text style={s.text}>
            {l.title} {l.disabled ? <Badge text="withheld" tone="warn" /> : null}
          </Text>
          <Text style={s.muted}>
            {l.id} · {l.exercises} exercises
          </Text>
          {l.disabled ? (
            <Button title="Restore" onPress={() => void act(l, false)} />
          ) : (
            <View>
              <TextInput
                accessibilityLabel="Why withhold this lesson"
                style={s.input}
                placeholder="Why withhold it?"
                value={note[l.id] ?? ""}
                onChangeText={(t) => setNote({ ...note, [l.id]: t })}
              />
              <Button title="Withhold" kind="danger" onPress={() => void act(l, true)} />
            </View>
          )}
        </Card>
      ))}
    </Section>
  );
}

function AuditSection() {
  const { data, err } = useOps<AuditRow[]>(() => api.adminAudit(), true);
  return (
    <Section title="Audit log">
      <ErrText msg={err} />
      {data?.length === 0 ? <Text style={s.muted}>Nothing recorded yet.</Text> : null}
      {data?.map((a) => (
        <Text key={a.id} style={[s.text, { marginVertical: 3 }]}>
          {a.action} · {a.targetType} {a.targetId}
          {"\n"}
          <Text style={s.muted}>
            {a.actorId ?? "system"} · {when(a.createdAt)}
          </Text>
        </Text>
      ))}
    </Section>
  );
}

function PrivacySection() {
  const { data, err, reload, setErr } = useOps<DeletionRequestRow[]>(
    () => api.adminDeletions(),
    true,
  );
  const [note, setNote] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<Record<string, string>>({});
  async function execute(r: DeletionRequestRow) {
    try {
      await api.adminExecuteErasure(r.id, confirmId[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  async function record(r: DeletionRequestRow) {
    try {
      await api.adminRecordErasure(r.id, note[r.id] ?? "");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <Section title="Privacy: deletion requests">
      <ErrText msg={err} />
      {data?.length === 0 ? <Text style={s.muted}>No deletion requests.</Text> : null}
      {data?.map((r) => {
        const ready = r.status === "pending" && Date.parse(r.notBefore) <= Date.now();
        return (
          <Card key={r.id}>
            <Badge text={r.status} tone="warn" />
            <Text style={s.text}>User {r.userId}</Text>
            <Text style={s.muted}>
              Requested {when(r.requestedAt)} · erasable after {when(r.notBefore)}
            </Text>
            {r.status === "pending" ? (
              ready ? (
                <>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Erasure note"
                    placeholder="What was erased and how"
                    value={note[r.id] ?? ""}
                    onChangeText={(t) => setNote({ ...note, [r.id]: t })}
                  />
                  <Button
                    title="Record erasure done elsewhere"
                    kind="danger"
                    onPress={() => void record(r)}
                  />
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Type the account id to erase"
                    placeholder={`Type ${r.userId} to erase now`}
                    autoCapitalize="none"
                    value={confirmId[r.id] ?? ""}
                    onChangeText={(t) => setConfirmId({ ...confirmId, [r.id]: t })}
                  />
                  <Button
                    title="Erase account permanently"
                    kind="danger"
                    disabled={(confirmId[r.id] ?? "") !== r.userId}
                    onPress={() => void execute(r)}
                  />
                </>
              ) : (
                <Text style={s.muted}>Cooling-off period still running.</Text>
              )
            ) : null}
          </Card>
        );
      })}
    </Section>
  );
}

function HealthSection() {
  const { data, err } = useOps<HealthReport>(() => api.adminHealth(), true);
  return (
    <Section title="Operations">
      <ErrText msg={err} />
      {data ? (
        <View style={{ gap: 6 }}>
          {data.attention.length === 0 ? (
            <Badge text="Nothing needs attention" tone="ok" />
          ) : (
            data.attention.map((a) => (
              <Text key={a} style={s.text}>
                Attention: {a}
              </Text>
            ))
          )}
          {data.integrations.map((i) => (
            <Text key={i.id} style={s.text}>
              {i.label}:{" "}
              {i.status === "configured" ? "configured (not verified live)" : "not configured"}
              {"\n"}
              <Text style={s.muted}>{i.note}</Text>
            </Text>
          ))}
          <Text style={s.muted}>
            Queue: {data.notifications.pending} pending, {data.notifications.failed} failed. Support
            open: {data.support.open}. Deletions pending: {data.privacy.pendingDeletions}. Erasure{" "}
            {data.privacy.erasureEnabled ? "enabled" : "disabled"}.
          </Text>
        </View>
      ) : null}
    </Section>
  );
}
