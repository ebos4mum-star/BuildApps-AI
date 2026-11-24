import { describe, expect, it } from "vitest";
import {
  adminListAudit,
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
