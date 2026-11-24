import { describe, expect, it } from "vitest";
import {
  adminListAudit,
  adminListDeletions,
  adminRecordErasure,
  cancelAccountDeletion,
  DELETION_COOLING_OFF_DAYS,
  exportMyData,
  myDeletionRequest,
  requestAccountDeletion,
  adminListContent,
  adminListReports,
  adminListSupport,
  adminListUsers,
  adminMatch,
  adminOverview,
  adminReviewExpert,
  adminReviewReport,
  adminSetLessonDisabled,
  adminSetSuspension,
  adminUpdateSupport,
  applyAsExpert,
  createAbuseReport,
  createMemoryStores,
  createSupportRequest,
  disabledLessonIds,
  getDashboard,
  getLessonForUser,
  listMySupport,
  listNotifications,
  markNotificationsRead,
  submitAttempt,
  WorkspaceError,
  type Deps,
} from "./index";

function setup() {
  const stores = createMemoryStores();
  stores.db.admins.add("admin");
  let clock = new Date("2026-03-01T10:00:00Z");
  const deps: Deps = { stores, gateway: null, stateSecret: "x".repeat(32), now: () => clock };
  return { stores, deps, tick: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof WorkspaceError ? e.code : "other"),
  );

describe("admin authorization", () => {
  it("rejects every admin operation for non-admins", async () => {
    const { deps } = setup();
    const ops = [
      adminOverview(deps, "mallory"),
      adminListUsers(deps, "mallory"),
      adminSetSuspension(deps, "mallory", "bob", { suspended: true, reason: "because" }),
      adminListSupport(deps, "mallory"),
      adminUpdateSupport(deps, "mallory", "x", { status: "resolved" }),
      adminListReports(deps, "mallory"),
      adminReviewReport(deps, "mallory", "x", { status: "dismissed", note: "nothing" }),
      adminListAudit(deps, "mallory"),
      adminListContent(deps, "mallory"),
      adminSetLessonDisabled(deps, "mallory", "anatomy-1", { disabled: true, note: "broken text" }),
    ];
    for (const r of await Promise.all(ops.map(code))) expect(r).toBe("forbidden");
  });
});

describe("account suspension", () => {
  it("is audited, needs a reason, and never applies to admins or oneself", async () => {
    const { deps, stores } = setup();
    await submitAttempt(stores.progress, {
      userId: "bob",
      exerciseId: "anatomy-1-seq",
      answer: { type: "sequence", order: [] },
    }).catch(() => undefined); // creates the learner row
    expect(await code(adminSetSuspension(deps, "admin", "bob", { suspended: true }))).toBe(
      "invalid",
    );
    expect(
      await code(adminSetSuspension(deps, "admin", "admin", { suspended: true, reason: "myself" })),
    ).toBe("forbidden");
    expect(
      await code(
        adminSetSuspension(deps, "admin", "nobody", { suspended: true, reason: "no such user" }),
      ),
    ).toBe("not_found");
    const u = await adminSetSuspension(deps, "admin", "bob", {
      suspended: true,
      reason: "abusive messages",
    });
    expect(u.suspended).toBe(true);
    expect(await stores.ops.isSuspended("bob")).toBe(true);
    const audit = await adminListAudit(deps, "admin");
    expect(audit[0]).toMatchObject({ action: "user.suspend", targetId: "bob", actorId: "admin" });
    await adminSetSuspension(deps, "admin", "bob", { suspended: false });
    expect(await stores.ops.isSuspended("bob")).toBe(false);
    expect((await adminListAudit(deps, "admin"))[0]!.action).toBe("user.reinstate");
  });
});

describe("support requests", () => {
  it("lets users file and track requests; only admins resolve them; users are notified", async () => {
    const { deps, stores } = setup();
    const s = await createSupportRequest(deps, "carol", {
      category: "account",
      subject: "Cannot sign in",
      body: "My phone keeps showing a sign-in error since yesterday.",
    });
    expect((await listMySupport(deps, "carol")).length).toBe(1);
    expect((await listMySupport(deps, "dave")).length).toBe(0);
    expect(
      await code(
        createSupportRequest(deps, "carol", { category: "billing", subject: "x", body: "y" }),
      ),
    ).toBe("invalid");
    await adminUpdateSupport(deps, "admin", s.id, {
      status: "resolved",
      note: "Reset your session",
    });
    expect((await listMySupport(deps, "carol"))[0]!.status).toBe("resolved");
    expect((await listNotifications(deps, "carol"))[0]!.title).toMatch(/resolved/);
    expect(await listNotifications(deps, "dave")).toEqual([]);
    expect(await code(adminUpdateSupport(deps, "admin", s.id, { status: "open" }))).toBe(
      "conflict",
    );
    expect((await adminListAudit(deps, "admin")).some((a) => a.action === "support.update")).toBe(
      true,
    );
    expect(stores.ops.support.size).toBe(1);
  });
  it("limits how many open requests one user can have", async () => {
    const { deps } = setup();
    const mk = () =>
      createSupportRequest(deps, "erin", {
        category: "other",
        subject: "Question",
        body: "A question that needs a human to answer it.",
      });
    for (let i = 0; i < 5; i++) await mk();
    expect(await code(mk())).toBe("rate_limited");
  });
});

describe("abuse reports", () => {
  it("are reviewed once, with a recorded reason, and audited", async () => {
    const { deps } = setup();
    await createAbuseReport(deps, "frank", {
      targetType: "expert",
      targetId: "e1",
      reason: "spam",
    });
    const [r] = await adminListReports(deps, "admin", "open");
    expect(r!.reporterId).toBe("frank");
    expect(
      await code(adminReviewReport(deps, "admin", r!.id, { status: "dismissed", note: "no" })),
    ).toBe("invalid");
    await adminReviewReport(deps, "admin", r!.id, {
      status: "actioned",
      note: "Warned the expert",
    });
    expect(
      await code(
        adminReviewReport(deps, "admin", r!.id, { status: "dismissed", note: "second look" }),
      ),
    ).toBe("conflict");
    expect((await adminListAudit(deps, "admin"))[0]).toMatchObject({ action: "report.review" });
    expect(
      await code(
        createAbuseReport(deps, "frank", { targetType: "planet", targetId: "x", reason: "spam" }),
      ),
    ).toBe("invalid");
  });
});

describe("learning content management", () => {
  it("withheld lessons disappear from lessons, the path and attempts", async () => {
    const { deps, stores } = setup();
    expect(await code(adminSetLessonDisabled(deps, "admin", "anatomy-1", { disabled: true }))).toBe(
      "invalid",
    );
    expect(
      await code(
        adminSetLessonDisabled(deps, "admin", "nope", { disabled: true, note: "no such" }),
      ),
    ).toBe("not_found");
    await adminSetLessonDisabled(deps, "admin", "anatomy-1", {
      disabled: true,
      note: "typo in step 3",
    });
    const off = await disabledLessonIds(stores);
    expect(off.has("anatomy-1")).toBe(true);
    expect(await getLessonForUser(stores.progress, "gina", "anatomy-1", off)).toBeNull();
    const d = await getDashboard(stores.progress, "gina", new Date(), off);
    const l = d.path.units.flatMap((u) => u.lessons).find((x) => x.id === "anatomy-1")!;
    expect(l).toMatchObject({ status: "locked", unavailable: true });
    await expect(
      submitAttempt(stores.progress, {
        userId: "gina",
        exerciseId: "anatomy-1-seq",
        answer: { type: "sequence", order: [] },
        disabledLessons: off,
      }),
    ).rejects.toMatchObject({ code: "locked" });
    await adminSetLessonDisabled(deps, "admin", "anatomy-1", { disabled: false });
    expect((await disabledLessonIds(stores)).size).toBe(0);
  });
});

describe("existing admin actions are audited and notify", () => {
  it("expert review and matching write audit entries", async () => {
    const { deps } = setup();
    const e = await applyAsExpert(deps, "hank", { displayName: "Hank", skills: ["next.js"] });
    await adminReviewExpert(deps, "admin", e.id, { decision: "approved" });
    expect((await listNotifications(deps, "hank"))[0]!.title).toMatch(/approved/);
    const log = await adminListAudit(deps, "admin");
    expect(log[0]).toMatchObject({ action: "expert.approved", targetId: e.id });
    expect(await code(adminMatch(deps, "admin", "missing", e.id))).toBe("not_found");
    const marked = await markNotificationsRead(deps, "hank", { ids: "all" });
    expect(marked.updated).toBe(1);
    expect((await listNotifications(deps, "hank"))[0]!.readAt).not.toBeNull();
  });
});

describe("privacy: export and account deletion", () => {
  it("exports only the caller's own data and audits the export", async () => {
    const { deps, stores } = setup();
    await createSupportRequest(deps, "alice", {
      category: "account",
      subject: "Help me out",
      body: "I need help with my account please.",
    });
    await createSupportRequest(deps, "bob", {
      category: "account",
      subject: "Bobs private issue",
      body: "This text must never reach alice.",
    });
    const out = await exportMyData(deps, "alice");
    expect(out.account.id).toBe("alice");
    expect(out.support).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("Bobs private issue");
    expect(
      stores.ops.audit.some((a) => a.action === "privacy.export" && a.actorId === "alice"),
    ).toBe(true);
  });
  it("requires typed confirmation, allows one pending request, and can be cancelled", async () => {
    const { deps } = setup();
    expect(await code(requestAccountDeletion(deps, "alice", { confirm: "yes" }))).toBe("invalid");
    const row = await requestAccountDeletion(deps, "alice", { confirm: "DELETE MY ACCOUNT" });
    expect(row.status).toBe("pending");
    expect(Date.parse(row.notBefore) - Date.parse(row.requestedAt)).toBe(
      DELETION_COOLING_OFF_DAYS * 86_400_000,
    );
    expect(
      await code(requestAccountDeletion(deps, "alice", { confirm: "DELETE MY ACCOUNT" })),
    ).toBe("conflict");
    expect((await myDeletionRequest(deps, "alice"))?.id).toBe(row.id);
    expect((await cancelAccountDeletion(deps, "alice")).status).toBe("cancelled");
    expect(await myDeletionRequest(deps, "alice")).toBeNull();
    expect(await code(cancelAccountDeletion(deps, "alice"))).toBe("not_found");
    // may ask again after cancelling
    expect(
      (await requestAccountDeletion(deps, "alice", { confirm: "DELETE MY ACCOUNT" })).status,
    ).toBe("pending");
  });
  it("only admins list requests, and erasure cannot be recorded before the cooling-off ends", async () => {
    const { deps, tick, stores } = setup();
    const row = await requestAccountDeletion(deps, "alice", { confirm: "DELETE MY ACCOUNT" });
    expect(await code(adminListDeletions(deps, "alice"))).toBe("forbidden");
    expect(await adminListDeletions(deps, "admin", "pending")).toHaveLength(1);
    expect(await code(adminRecordErasure(deps, "alice", row.id, { note: "do it now" }))).toBe(
      "forbidden",
    );
    expect(await code(adminRecordErasure(deps, "admin", row.id, { note: "too early here" }))).toBe(
      "conflict",
    );
    tick(DELETION_COOLING_OFF_DAYS * 86_400_000 + 1000);
    expect(await code(adminRecordErasure(deps, "admin", row.id, { note: "x" }))).toBe("invalid");
    const done = await adminRecordErasure(deps, "admin", row.id, { note: "Erased per runbook" });
    expect(done.status).toBe("fulfilled");
    expect(await code(adminRecordErasure(deps, "admin", row.id, { note: "Erased again" }))).toBe(
      "conflict",
    );
    expect(stores.ops.audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["privacy.deletion_requested", "privacy.erasure_recorded"]),
    );
  });
});
