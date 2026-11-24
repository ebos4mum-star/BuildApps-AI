import { describe, expect, it } from "vitest";
import {
  adminExecuteErasure,
  cancelAccountDeletion,
  createMemoryStores,
  createSupportRequest,
  dispatchOutbox,
  enqueueDueReminders,
  enqueueWeeklySummaries,
  exportMyData,
  expoPushProvider,
  getAccountView,
  notify,
  registerDevice,
  requestAccountDeletion,
  saveNotificationPrefs,
  saveMyProfile,
  submitAttempt,
  updateAccount,
  webhookEmailProvider,
  WorkspaceError,
  MAX_ATTEMPTS,
  type Deps,
  type EmailProvider,
  type ProviderResult,
  type PushProvider,
} from "./index";

function setup(start = "2026-03-10T12:00:00Z") {
  const stores = createMemoryStores();
  stores.db.admins.add("admin");
  let clock = new Date(start);
  const deps: Deps = { stores, gateway: null, stateSecret: "x".repeat(32), now: () => clock };
  return {
    stores,
    deps,
    set: (iso: string) => (clock = new Date(iso)),
    tick: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof WorkspaceError ? e.code : "other"),
  );
const prefsOn = { push: true, email: true, categories: {}, quietHours: null };
const token = "ExponentPushToken[abcdefgh1234]";

function fakePush(results: ProviderResult[] = [{ ok: true }]): PushProvider & { sent: unknown[] } {
  const sent: unknown[] = [];
  let i = 0;
  return {
    name: "fake-push",
    sent,
    async send(m) {
      sent.push(m);
      return results[Math.min(i++, results.length - 1)]!;
    },
  };
}
function fakeEmail(result: ProviderResult = { ok: true }): EmailProvider & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    name: "fake-email",
    sent,
    async send(m) {
      sent.push(m);
      return result;
    },
  };
}

describe("account settings", () => {
  it("validates name and time zone and audits the change", async () => {
    const { deps, stores } = setup();
    expect(
      await code(updateAccount(deps, "u", { displayName: "x".repeat(61), timeZone: "UTC" })),
    ).toBe("invalid");
    expect(
      await code(updateAccount(deps, "u", { displayName: "Ada", timeZone: "Mars/Base" })),
    ).toBe("invalid");
    expect(
      await updateAccount(deps, "u", { displayName: "  Ada  ", timeZone: "Europe/London" }),
    ).toEqual({ displayName: "Ada", timeZone: "Europe/London" });
    expect(await updateAccount(deps, "u", { displayName: "  ", timeZone: "UTC" })).toMatchObject({
      displayName: null,
    });
    expect(stores.ops.audit.some((a) => a.action === "account.update")).toBe(true);
  });
  it("devices: validated, capped, and tokens never leave the server", async () => {
    const { deps } = setup();
    expect(await code(registerDevice(deps, "u", { platform: "ios", token: "bad token!" }))).toBe(
      "invalid",
    );
    await registerDevice(deps, "u", { platform: "ios", token });
    await registerDevice(deps, "u", { platform: "ios", token }); // idempotent
    const view = await getAccountView(deps, "u");
    expect(view.devices).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(token);
    for (let i = 0; i < 9; i++)
      await registerDevice(deps, "u", { platform: "android", token: `device-token-${i}-xxxx` });
    expect(
      await code(registerDevice(deps, "u", { platform: "android", token: "one-too-many-token" })),
    ).toBe("conflict");
  });
});

describe("notification delivery", () => {
  it("in-app only by default: nothing is queued until the user opts in", async () => {
    const { deps, stores } = setup();
    await notify(deps, "u", { kind: "support", title: "Reply from support" });
    expect(stores.account.outbox).toHaveLength(0);
    expect(await stores.ops.listNotifications("u", 10)).toHaveLength(1);
  });
  it("opting in queues push and email; providers deliver; a retry never double-sends", async () => {
    const { deps, stores } = setup();
    await saveNotificationPrefs(deps, "u", prefsOn);
    await registerDevice(deps, "u", { platform: "ios", token });
    stores.account.emails.set("u", "u@example.test");
    await notify(deps, "u", {
      kind: "support",
      title: "Reply from support",
      body: "We replied.",
      link: "/support",
    });
    expect(stores.account.outbox.map((o) => o.channel).sort()).toEqual(["email", "push"]);
    const push = fakePush();
    const email = fakeEmail();
    const r = await dispatchOutbox(deps, { push, email });
    expect(r).toMatchObject({ processed: 2, sent: 2 });
    expect(push.sent).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
    expect((await dispatchOutbox(deps, { push, email })).processed).toBe(0);
  });
  it("missing providers, devices or emails are skipped honestly, never reported as sent", async () => {
    const { deps, stores } = setup();
    await saveNotificationPrefs(deps, "u", prefsOn);
    await notify(deps, "u", { kind: "project", title: "Scan finished" });
    const r = await dispatchOutbox(deps, {});
    expect(r).toMatchObject({ skipped: 2, sent: 0 });
    expect(stores.account.outbox.map((o) => o.lastError).sort()).toEqual([
      "provider_not_configured",
      "provider_not_configured",
    ]);
    await notify(deps, "u", { kind: "project", title: "Another" });
    const r2 = await dispatchOutbox(deps, { push: fakePush(), email: fakeEmail() });
    expect(r2.skipped).toBe(2); // no device, no email on file
  });
  it("preferences changed after queueing are honoured at dispatch time", async () => {
    const { deps, stores } = setup();
    await saveNotificationPrefs(deps, "u", prefsOn);
    await registerDevice(deps, "u", { platform: "ios", token });
    await notify(deps, "u", { kind: "project", title: "Scan finished" });
    await saveNotificationPrefs(deps, "u", { ...prefsOn, push: false, email: false });
    const push = fakePush();
    expect((await dispatchOutbox(deps, { push })).sent).toBe(0);
    expect(push.sent).toHaveLength(0);
    expect(stores.account.outbox.every((o) => o.status === "skipped")).toBe(true);
  });
  it("retryable failures back off and eventually fail; permanent failures fail at once; dead devices are removed", async () => {
    const { deps, stores, tick } = setup();
    await saveNotificationPrefs(deps, "u", { ...prefsOn, email: false });
    await registerDevice(deps, "u", { platform: "ios", token });
    await notify(deps, "u", { kind: "project", title: "Scan finished" });
    const flaky = fakePush([{ ok: false, retryable: true, error: "HTTP 503" }]);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await dispatchOutbox(deps, { push: flaky });
      tick(2 * 3_600_000);
    }
    expect(stores.account.outbox[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    await notify(deps, "u", { kind: "project", title: "Second" });
    const dead = fakePush([
      { ok: false, retryable: false, error: "DeviceNotRegistered", invalidToken: true },
    ]);
    await dispatchOutbox(deps, { push: dead });
    expect(stores.account.outbox[1]!.status).toBe("failed");
    expect(await stores.account.listDevices("u")).toHaveLength(0);
  });
  it("quiet hours hold push but never account-safety messages", async () => {
    const { deps, stores, set } = setup("2026-03-10T23:30:00Z");
    await saveNotificationPrefs(deps, "u", {
      ...prefsOn,
      email: false,
      quietHours: { start: 22, end: 7 },
    });
    await registerDevice(deps, "u", { platform: "ios", token });
    await notify(deps, "u", { kind: "project", title: "Scan finished" });
    await notify(deps, "u", { kind: "privacy", title: "Deletion requested" });
    const push = fakePush();
    await dispatchOutbox(deps, { push });
    expect(push.sent).toHaveLength(1); // only the security message
    expect(stores.account.outbox.find((o) => o.category === "project")!.status).toBe("pending");
    set("2026-03-11T09:30:00Z");
    await dispatchOutbox(deps, { push });
    expect(push.sent).toHaveLength(2);
  });
});

describe("reminders and weekly summaries", () => {
  const profile = {
    experience: "some",
    goals: ["ship_first_app"],
    tools: ["cursor"],
    intent: "learn_first",
    pace: "steady",
    projectTypes: [],
    platforms: [],
    reminders: { enabled: true, hour: 18 },
  };
  it("sends one reminder per day, at the chosen local hour, only if the learner has not practised", async () => {
    const { deps, stores, set } = setup("2026-03-10T17:00:00Z");
    await saveMyProfile(deps, "u", profile);
    await saveNotificationPrefs(deps, "u", { ...prefsOn, email: false, quietHours: null });
    expect((await enqueueDueReminders(deps)).queued).toBe(0); // 17:00, not yet
    set("2026-03-10T18:05:00Z");
    expect((await enqueueDueReminders(deps)).queued).toBe(1);
    expect((await enqueueDueReminders(deps)).queued).toBe(0); // idempotent within the day
    set("2026-03-11T18:05:00Z");
    await submitAttempt(stores.progress, {
      userId: "u",
      exerciseId: "anatomy-1-bank",
      answer: { nope: 1 },
      now: deps.now!(),
    }).catch(() => undefined);
    // practised today -> no reminder
    await stores.progress.apply({
      userId: "u",
      exerciseId: "anatomy-1-bank",
      passed: true,
      expectedVersion: 0,
      awards: [
        { awardKey: "ex:1", source: "exercise", xp: 10, occurredAt: deps.now!().toISOString() },
      ],
      achievements: [],
      streak: (await stores.progress.load("u", "")).streak,
    });
    expect((await enqueueDueReminders(deps)).queued).toBe(0);
  });
  it("a learner without reminders or opt-in gets nothing", async () => {
    const { deps, stores, set } = setup("2026-03-10T18:05:00Z");
    await saveMyProfile(deps, "u", { ...profile, reminders: { enabled: false, hour: 18 } });
    expect((await enqueueDueReminders(deps)).queued).toBe(0);
    await saveMyProfile(deps, "v", profile); // reminders on but push/email off
    expect((await enqueueDueReminders(deps)).queued).toBe(0);
    expect(stores.account.outbox).toHaveLength(0);
    set("2026-03-09T09:10:00Z"); // Monday 09:10
    expect((await enqueueWeeklySummaries(deps)).queued).toBe(0);
  });
  it("weekly summary goes out once on Monday 09:00 local for opted-in users", async () => {
    const { deps, set } = setup("2026-03-09T09:10:00Z");
    await saveNotificationPrefs(deps, "u", { ...prefsOn, email: false, quietHours: null });
    expect((await enqueueWeeklySummaries(deps)).queued).toBe(1);
    expect((await enqueueWeeklySummaries(deps)).queued).toBe(0);
    set("2026-03-10T09:10:00Z");
    expect((await enqueueWeeklySummaries(deps)).queued).toBe(0); // Tuesday
  });
});

describe("provider adapters (mocked network only)", () => {
  it("expo push maps responses to retryable, permanent and dead-token outcomes", async () => {
    const mk = (status: number, body: unknown) =>
      expoPushProvider(
        (async () => new Response(JSON.stringify(body), { status })) as typeof fetch,
      );
    const msg = { token, platform: "ios", title: "t", body: "b", link: "/learn" };
    expect(await mk(200, { data: { status: "ok" } }).send(msg)).toEqual({ ok: true });
    expect(await mk(503, {}).send(msg)).toMatchObject({ ok: false, retryable: true });
    expect(await mk(400, {}).send(msg)).toMatchObject({ ok: false, retryable: false });
    expect(
      await mk(200, { data: { status: "error", details: { error: "DeviceNotRegistered" } } }).send(
        msg,
      ),
    ).toMatchObject({ invalidToken: true });
    expect(await mk(200, {}).send({ ...msg, token: "not-a-token" })).toMatchObject({
      invalidToken: true,
    });
    const down = expoPushProvider((async () => {
      throw new Error("offline");
    }) as typeof fetch);
    expect(await down.send(msg)).toMatchObject({ retryable: true });
  });
  it("webhook email requires https and sends the secret as a bearer token", async () => {
    expect(() => webhookEmailProvider("http://insecure.test/x", "s")).toThrow();
    let seen: { auth?: string; body?: string } = {};
    const p = webhookEmailProvider("https://relay.example.test/send", "topsecret", (async (
      _u: unknown,
      init: RequestInit,
    ) => {
      seen = {
        auth: (init.headers as Record<string, string>).Authorization,
        body: String(init.body),
      };
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch);
    expect(await p.send({ to: "a@b.test", subject: "Hi", text: "Yo" })).toEqual({ ok: true });
    expect(seen.auth).toBe("Bearer topsecret");
    expect(JSON.parse(seen.body!)).toMatchObject({ to: "a@b.test" });
  });
});

describe("account erasure (synthetic accounts only)", () => {
  async function richUser(deps: Deps, stores: ReturnType<typeof createMemoryStores>, id: string) {
    await saveMyProfile(deps, id, {
      experience: "new",
      goals: ["ship_first_app"],
      tools: ["cursor"],
      intent: "start",
      pace: "light",
      projectTypes: [],
      platforms: [],
      reminders: { enabled: false, hour: 18 },
    });
    await createSupportRequest(deps, id, {
      category: "other",
      subject: "Synthetic ticket",
      body: "This belongs to a synthetic account.",
    });
    await saveNotificationPrefs(deps, id, prefsOn);
    await registerDevice(deps, id, { platform: "ios", token: `tok-${id}-1234567` });
    await exportMyData(deps, id); // creates an audit entry authored by the user
    stores.account.emails.set(id, `${id}@example.test`);
    stores.projects.rows.set(`p-${id}`, { id: `p-${id}`, ownerId: id, milestones: [] } as never);
  }
  const tenDays = 15 * 86_400_000;
  it("is disabled unless explicitly enabled", async () => {
    const { deps, tick } = setup();
    const row = await requestAccountDeletion(deps, "victim", { confirm: "DELETE MY ACCOUNT" });
    tick(tenDays);
    expect(
      await code(adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "victim" })),
    ).toBe("unavailable");
  });
  it("erases everything the account owns, keeps the audit trail, and refuses unsafe cases", async () => {
    const { deps, stores, tick } = setup();
    deps.allowErasure = true;
    await richUser(deps, stores, "victim");
    await richUser(deps, stores, "bystander");
    const row = await requestAccountDeletion(deps, "victim", { confirm: "DELETE MY ACCOUNT" });
    expect(
      await code(adminExecuteErasure(deps, "victim", row.id, { confirmUserId: "victim" })),
    ).toBe("forbidden");
    expect(
      await code(adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "victim" })),
    ).toBe("conflict"); // cooling-off
    tick(tenDays);
    expect(
      await code(adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "someone-else" })),
    ).toBe("invalid");
    stores.db.requests.set("r1", {
      id: "r1",
      requesterId: "victim",
      projectId: "p-victim",
      status: "in_progress",
    } as never);
    expect(
      await code(adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "victim" })),
    ).toBe("conflict"); // expert work open
    stores.db.requests.delete("r1");
    const out = await adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "victim" });
    expect(out).toEqual({ erased: true, userId: "victim" });
    // victim: gone everywhere
    expect(await stores.profiles.get("victim")).toBeNull();
    expect(await stores.ops.listSupportForUser("victim")).toHaveLength(0);
    expect(await stores.ops.getPendingDeletion("victim")).toBeNull();
    expect(await stores.account.listDevices("victim")).toHaveLength(0);
    expect(await stores.account.getPrefs("victim")).toBeNull();
    expect(stores.db.projects.has("p-victim")).toBe(false);
    // bystander untouched
    expect(await stores.profiles.get("bystander")).not.toBeNull();
    expect(await stores.ops.listSupportForUser("bystander")).toHaveLength(1);
    expect(stores.db.projects.has("p-bystander")).toBe(true);
    // audit: entries remain, the erased user's authorship is removed
    const audit = stores.ops.audit;
    expect(
      audit.some((a) => a.action === "privacy.erasure_executed" && a.actorId === "admin"),
    ).toBe(true);
    expect(
      audit.some(
        (a) => a.action === "privacy.export" && a.targetId === "victim" && a.actorId === null,
      ),
    ).toBe(true);
    expect(audit.some((a) => a.actorId === "victim")).toBe(false);
  });
  it("never erases administrators or the acting admin", async () => {
    const { deps, stores, tick } = setup();
    deps.allowErasure = true;
    stores.db.admins.add("admin2");
    const row = await requestAccountDeletion(deps, "admin2", { confirm: "DELETE MY ACCOUNT" });
    tick(tenDays);
    expect(
      await code(adminExecuteErasure(deps, "admin", row.id, { confirmUserId: "admin2" })),
    ).toBe("forbidden");
    await cancelAccountDeletion(deps, "admin2");
    const mine = await requestAccountDeletion(deps, "admin", { confirm: "DELETE MY ACCOUNT" });
    tick(tenDays);
    expect(
      await code(adminExecuteErasure(deps, "admin", mine.id, { confirmUserId: "admin" })),
    ).toBe("forbidden");
  });
});
