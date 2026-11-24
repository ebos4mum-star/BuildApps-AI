/* eslint-disable */
// Stage 9: admin operations end-to-end (user, admin, stranger). Needs a fresh dev server (see README).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3100";
const log = (...a) => console.log(...a);
const ok = (c, m) => {
  if (!c) {
    console.error("ASSERT FAILED:", m);
    process.exitCode = 1;
    throw new Error(m);
  }
  log("  ok -", m);
};

async function user(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.dev = name;
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      page.errors.push(m.text());
  });
  await page.goto(`${BASE}/login`);
  await page.fill("#dn", name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/onboarding");
  return page;
}
const api = (page, method, path, body) =>
  page.evaluate(
    async ([m, p, b, u]) => {
      const r = await fetch(p, {
        method: m,
        headers: { Authorization: `Bearer dev:${u}`, "Content-Type": "application/json" },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    },
    [method, path, body, page.dev],
  );

(async () => {
  const browser = await chromium.launch();
  const pat = await user(browser, "pat");
  const stranger = await user(browser, "stranger");
  const admin = await user(browser, "admin");

  await api(stranger, "GET", "/api/dashboard"); // creates the learner record
  await api(pat, "GET", "/api/dashboard");
  log("# authorization: only administrators reach admin endpoints");
  for (const p of [
    "/api/admin/overview",
    "/api/admin/users",
    "/api/admin/support",
    "/api/admin/reports",
    "/api/admin/audit",
    "/api/admin/content",
  ])
    ok((await api(stranger, "GET", p)).status === 403, `non-admin refused: ${p}`);
  ok(
    (
      await api(stranger, "POST", "/api/admin/users/pat/suspension", {
        suspended: true,
        reason: "attempted abuse",
      })
    ).status === 403,
    "non-admin cannot suspend",
  );

  log("# user files a support request through the UI");
  await pat.goto(`${BASE}/support`);
  await pat.selectOption("#sc", "account");
  await pat.fill("#ss", "Cannot see my progress");
  await pat.fill("#sb", "My progress looks empty after I switched phones today.");
  await pat.getByRole("button", { name: "Send", exact: true }).click();
  await pat.getByText("your request was sent").waitFor();
  await pat.getByText("Cannot see my progress").waitFor();
  ok(true, "support request visible to its author");
  ok(
    ((await api(stranger, "GET", "/api/support")).json.support ?? []).length === 0,
    "other users cannot see it",
  );

  log("# admin works the queue in the portal");
  await admin.goto(`${BASE}/admin`);
  await admin.getByTestId("admin-overview").waitFor();
  await admin.getByRole("tab", { name: "Support" }).click();
  await admin.getByText("Cannot see my progress").waitFor();
  await admin
    .getByPlaceholder("Note to the user (optional)")
    .fill("Fixed - please reopen the app.");
  await admin.getByRole("button", { name: "Resolve" }).click();
  await admin.getByText("resolved").first().waitFor();
  ok(true, "admin resolved the request");

  log("# user is notified");
  await pat.goto(`${BASE}/support`);
  await pat
    .getByTestId("notifications")
    .getByText(/resolved/)
    .waitFor();
  ok(
    (await pat.getByText("Reply: Fixed - please reopen the app.").count()) === 1,
    "admin reply shown to user",
  );
  await pat.getByRole("button", { name: "Mark all as read" }).click();
  await pat.getByRole("button", { name: "Mark all as read" }).waitFor({ state: "detached" });
  ok(true, "notifications can be marked read");

  log("# abuse report -> review");
  await pat.fill("#ri", "stranger");
  await pat.selectOption("#rt", "user");
  await pat.selectOption("#rr", "spam");
  await pat.getByRole("button", { name: "Submit report" }).click();
  await pat.getByText("Report received").waitFor();
  await admin.getByRole("tab", { name: "Abuse reports" }).click();
  await admin.getByText("stranger").first().waitFor();
  await admin.getByPlaceholder("Decision note (required)").fill("Warned the account holder");
  await admin.getByRole("button", { name: "Mark actioned" }).click();
  await admin.getByText("Decision: Warned the account holder").waitFor();
  ok(
    (
      await api(admin, "POST", "/api/admin/reports/none/review", {
        status: "dismissed",
        note: "report not found",
      })
    ).status === 404,
    "unknown report is a 404",
  );

  log("# suspension blocks the account everywhere, reinstatement restores it");
  await admin.getByRole("tab", { name: "Users" }).click();
  await admin.getByPlaceholder("Reason (required to suspend)").first().waitFor();
  const sus = await api(admin, "POST", "/api/admin/users/dev-stranger/suspension", {
    suspended: true,
  });
  ok(sus.status === 400, "suspension needs a recorded reason");
  const sus2 = await api(admin, "POST", "/api/admin/users/dev-stranger/suspension", {
    suspended: true,
    reason: "spamming other learners",
  });
  ok(sus2.status === 200 && sus2.json.user.suspended === true, "admin suspends an account");
  const blocked = await api(stranger, "GET", "/api/dashboard");
  ok(
    blocked.status === 403 && blocked.json.error.code === "account_suspended",
    "suspended account is refused by the API",
  );
  ok(
    (
      await api(admin, "POST", "/api/admin/users/dev-admin/suspension", {
        suspended: true,
        reason: "myself",
      })
    ).status === 403,
    "admins cannot suspend themselves",
  );
  ok(
    (await api(admin, "POST", "/api/admin/users/dev-stranger/suspension", { suspended: false }))
      .status === 200,
    "admin reinstates",
  );
  ok(
    (await api(stranger, "GET", "/api/dashboard")).status === 200,
    "reinstated account works again",
  );

  log("# learning content management");
  ok(
    (await api(admin, "POST", "/api/admin/content/anatomy-1", { disabled: true })).status === 400,
    "withholding needs a reason",
  );
  ok(
    (
      await api(admin, "POST", "/api/admin/content/anatomy-1", {
        disabled: true,
        note: "typo in step 3",
      })
    ).status === 200,
    "admin withholds a lesson",
  );
  ok(
    (await api(pat, "GET", "/api/lessons/anatomy-1")).status === 403,
    "withheld lesson is not served",
  );
  const att = await api(pat, "POST", "/api/attempts", {
    exerciseId: "anatomy-1-seq",
    answer: { type: "sequence", order: [] },
  });
  ok(att.status === 403, "attempts on a withheld lesson are refused");
  const dash = await api(pat, "GET", "/api/dashboard");
  ok(
    dash.json.path.units.flatMap((u) => u.lessons).find((l) => l.id === "anatomy-1").unavailable ===
      true,
    "dashboard marks it unavailable",
  );
  ok(
    (await api(admin, "POST", "/api/admin/content/anatomy-1", { disabled: false })).status === 200,
    "admin restores it",
  );
  ok((await api(pat, "GET", "/api/lessons/anatomy-1")).status === 200, "lesson is served again");

  log("# audit trail");
  await admin.goto(`${BASE}/admin`);
  await admin.getByRole("tab", { name: "Audit log" }).click();
  const log_ = admin.getByTestId("audit-log");
  await log_.waitFor();
  for (const a of [
    "support.update",
    "report.review",
    "user.suspend",
    "user.reinstate",
    "lesson.disable",
    "lesson.enable",
  ])
    ok((await log_.getByText(a, { exact: true }).count()) >= 1, `audit entry recorded: ${a}`);

  for (const p of [pat, stranger, admin])
    ok(p.errors.length === 0, `no browser console errors for ${p.dev}`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
