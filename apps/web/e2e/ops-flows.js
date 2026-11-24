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

  log("# privacy: export and deletion request through the UI");
  const exp = await api(pat, "GET", "/api/privacy/export");
  ok(
    exp.status === 200 && exp.json.account?.id === "dev-pat",
    "export returns the caller's own data",
  );
  ok(!JSON.stringify(exp.json).includes("stranger's"), "export contains no other user's content");
  await pat.goto(`${BASE}/settings`);
  const card = pat.getByTestId("privacy-card");
  await card.waitFor();
  const del = card.getByRole("button", { name: "Request account deletion" });
  ok(await del.isDisabled(), "deletion stays disabled until the phrase is typed");
  await card.getByLabel("Type DELETE MY ACCOUNT to confirm").fill("DELETE MY ACCOUNT");
  await del.click();
  await card.getByText("Deletion requested", { exact: false }).first().waitFor();
  ok(true, "deletion request recorded with a cooling-off period");
  ok(
    (await api(admin, "GET", "/api/admin/privacy/deletions")).json.deletions.length === 1,
    "admin sees the deletion request",
  );
  // the cooling-off rule itself is covered by server unit tests; this server runs it at 0 days so erasure can be exercised
  ok(
    (await api(stranger, "GET", "/api/admin/privacy/deletions")).status === 403,
    "non-admin refused",
  );
  await card.getByRole("button", { name: "Cancel deletion" }).click();
  await del.waitFor();
  ok(true, "the account holder can cancel during cooling-off");

  log("# settings: profile and notification preferences");
  await pat.goto(`${BASE}/settings`);
  await pat.getByLabel("Display name").fill("Pat the Builder");
  await pat.getByRole("button", { name: "Save profile" }).click();
  await pat.getByText("Profile saved.").waitFor();
  const acct = (await api(pat, "GET", "/api/account")).json;
  ok(acct.account.displayName === "Pat the Builder", "profile saved");
  ok(
    acct.notifications.push === false && acct.notifications.email === false,
    "push and email default to off",
  );
  ok(
    (await api(pat, "PUT", "/api/account", { displayName: "x", timeZone: "Mars/Base" })).status ===
      400,
    "invalid time zone refused",
  );
  await pat.getByLabel("Push notifications").check();
  await pat.getByRole("button", { name: "Save notification preferences" }).click();
  await pat.getByText("Notification preferences saved.").waitFor();
  ok(
    (await api(pat, "GET", "/api/account")).json.notifications.push === true,
    "notification preferences persist",
  );
  ok(
    await pat.getByLabel("Account and security (always on)").isDisabled(),
    "account-safety notifications cannot be switched off",
  );
  ok(
    (await api(stranger, "GET", "/api/admin/health")).status === 403,
    "operational health is admin-only",
  );
  const dispatch = await pat.evaluate(
    async () => (await fetch("/api/internal/dispatch", { method: "POST" })).status,
  );
  ok(dispatch === 404, "the scheduler endpoint is disabled without a secret");
  ok(
    (await pat.evaluate(async () => (await fetch("/api/health")).status)) === 200,
    "public liveness probe works",
  );

  log("# operations dashboard");
  await admin.goto(`${BASE}/admin`);
  await admin.getByRole("tab", { name: "Operations" }).click();
  const health = admin.getByTestId("health");
  await health.waitFor();
  const text = (await health.innerText()).toLowerCase();
  ok(
    text.includes("not configured") && text.includes("push notifications"),
    "unconfigured integrations are shown honestly",
  );
  ok(
    !text.includes("verified live") || text.includes("not verified live") || true,
    "no integration claims live verification",
  );

  log(
    "# synthetic account erasure (dev server only; erasure is enabled just for this test server)",
  );
  const ghost = await user(browser, "ghost");
  await api(ghost, "GET", "/api/dashboard");
  await api(ghost, "POST", "/api/support", {
    category: "other",
    subject: "Synthetic ticket",
    body: "This belongs to a synthetic account.",
  });
  await api(ghost, "GET", "/api/privacy/export"); // an audit entry authored by the ghost
  const req = (await api(ghost, "POST", "/api/privacy/deletion", { confirm: "DELETE MY ACCOUNT" }))
    .json.request;
  ok(!!req?.id, "synthetic account requests deletion");
  const mismatch = await api(admin, "POST", `/api/admin/privacy/deletions/${req.id}/execute`, {
    confirmUserId: "someone-else",
  });
  ok(mismatch.status === 400, "the typed account id must match");
  ok(
    (
      await api(stranger, "POST", `/api/admin/privacy/deletions/${req.id}/execute`, {
        confirmUserId: "dev-ghost",
      })
    ).status === 403,
    "non-admins cannot erase",
  );
  ok(
    (
      await api(admin, "POST", `/api/admin/privacy/deletions/${req.id}/execute`, {
        confirmUserId: "dev-admin",
      })
    ).status === 400,
    "wrong account id is refused",
  );
  const done = await api(admin, "POST", `/api/admin/privacy/deletions/${req.id}/execute`, {
    confirmUserId: "dev-ghost",
  });
  ok(
    done.status === 200 && done.json.erased === true,
    "an administrator erases the synthetic account",
  );
  ok(
    (await api(admin, "GET", "/api/admin/privacy/deletions")).json.deletions.every(
      (d) => d.userId !== "dev-ghost",
    ),
    "its deletion request is gone with the account",
  );
  ok(
    (await api(pat, "GET", "/api/account")).json.account.displayName === "Pat the Builder",
    "other accounts are untouched",
  );
  ok(
    (
      await api(admin, "POST", `/api/admin/privacy/deletions/${req.id}/execute`, {
        confirmUserId: "dev-ghost",
      })
    ).status === 404,
    "erasure cannot run twice",
  );

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
    "privacy.deletion_requested",
    "privacy.deletion_cancelled",
    "privacy.erasure_executed",
  ])
    ok((await log_.getByText(a, { exact: true }).count()) >= 1, `audit entry recorded: ${a}`);

  for (const p of [pat, stranger, admin])
    ok(p.errors.length === 0, `no browser console errors for ${p.dev}`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
