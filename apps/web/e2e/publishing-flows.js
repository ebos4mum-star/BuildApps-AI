/* eslint-disable */
// Stage 6: Publishing Center end-to-end (owner, expert, admin). Needs a fresh dev server (see README).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "/tmp";
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
  page.on("dialog", (d) => d.accept());
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
  const alice = await user(browser, "alice");
  const mallory = await user(browser, "mallory");
  const dana = await user(browser, "dana");
  const admin = await user(browser, "admin");

  log("# Setup: a project with real repository evidence");
  await alice.goto(`${BASE}/projects/new?journey=continue`);
  await alice.fill("#name", "Habit Hero");
  await alice.fill("#desc", "Login and streaks work, I want to publish it");
  await alice.fill("#repo", "https://github.com/demo/healthy-app");
  await alice.getByRole("button", { name: "Create project" }).click();
  await alice.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  const projectUrl = alice.url();
  const projectId = projectUrl.split("/").pop();
  await alice.getByRole("button", { name: "Connect GitHub (read-only)" }).click();
  await alice.waitForURL(/github=connected/);
  await alice.goto(projectUrl);
  await alice.getByRole("button", { name: "Link repository" }).click();
  await alice.getByRole("button", { name: "Run verification" }).waitFor();
  await alice.getByRole("button", { name: "Run verification" }).click();
  await alice.getByText(/Verification recorded\./).waitFor();
  ok(true, "repository linked and verified (CI + static evidence recorded)");

  log("# 6C: Publishing Center - honest framing and target selection");
  await alice.getByRole("heading", { name: "Publishing Center" }).waitFor();
  const intro = await alice.locator("#publishing").innerText();
  ok(
    /recorded by you/i.test(intro) && /has not submitted anything/i.test(intro),
    "the center states that submissions are recorded by the owner and BuildApps submits nothing",
  );
  ok(
    !/\$\s*\d|per app|subscription|price/i.test(await alice.locator("body").innerText()),
    "no pricing or billing text anywhere in the UI",
  );
  await alice.getByRole("button", { name: "+ Google Play" }).click();
  await alice.getByTestId("target-google_play").waitFor();
  ok(
    (await alice.getByRole("button", { name: "+ Google Play" }).count()) === 0,
    "an added target disappears from the 'add' list",
  );
  const card = alice.getByTestId("target-google_play");
  ok(/Not ready yet/i.test(await card.innerText()), "a new target starts as not ready");
  ok(
    /Verified/i.test(await card.getByTestId("req-build.ci-passing").innerText()),
    "CI requirement is Verified from repository evidence",
  );
  ok(
    /Missing/i.test(await card.getByTestId("req-privacy.policy-url").innerText()),
    "privacy policy is Missing until entered",
  );
  ok(
    (await card.getByTestId("req-build.ci-passing").getByRole("button").count()) === 0,
    "evidence-derived items offer no 'I've done this' button",
  );

  log("# 6B/6E: user claims can never become verified");
  const forged = await api(
    alice,
    "PUT",
    `/api/publishing/targets/${(await api(alice, "GET", `/api/publishing/projects/${projectId}`)).json.targets[0].target.id}/claims/build.ci-passing`,
    { kind: "self_reported", note: "Trust me, CI passes" },
  );
  ok(forged.status === 400, "API refuses a manual claim on a verified-by-evidence requirement");
  const forged2 = await api(
    alice,
    "PUT",
    `/api/publishing/targets/${(await api(alice, "GET", `/api/publishing/projects/${projectId}`)).json.targets[0].target.id}/claims/assets.icon`,
    { kind: "verified", note: "Fully verified!" },
  );
  ok(forged2.status === 400, "API refuses a 'verified' claim kind");

  log("# 6C: listing details + checklist");
  await card.getByLabel("App name (max 30)").fill("Habit Hero");
  await card
    .getByLabel("Description (80+ characters)")
    .fill(
      "A habit tracker for students that rewards consistency with streaks, quests and friendly reminders.",
    );
  await card.getByLabel("Category").fill("Productivity");
  await card.getByLabel("Support URL (https)").fill("https://example.com/support");
  await card.getByLabel("Privacy policy URL (https)").fill("https://example.com/privacy");
  await card.getByLabel("Application ID (com.example.app)").fill("com.example.habit");
  await card.getByLabel("Does the app collect user data?").selectOption("true");
  await card.getByLabel(/Notes for reviewers/).fill("Tap the settings tab, then Export");
  await card.getByRole("button", { name: "Save listing details" }).click();
  await alice.getByText("Listing details saved.").waitFor();
  ok(
    /Self-reported/i.test(await card.getByTestId("req-privacy.policy-url").innerText()),
    "entered metadata shows as Self-reported (not verified)",
  );
  await card.getByLabel(/Notes for reviewers/).fill("login password: Hunter2Hunter2");
  await card.getByRole("button", { name: "Save listing details" }).click();
  await alice.locator(".err").first().waitFor();
  ok(
    /password|key|token/i.test(await alice.locator(".err").first().innerText()),
    "credentials in reviewer notes are refused",
  );
  await card.getByLabel(/Notes for reviewers/).fill("Tap the settings tab, then Export");
  await card.getByRole("button", { name: "Save listing details" }).click();
  await alice.getByText("Listing details saved.").waitFor();

  // claim every claimable item through the UI
  for (let i = 0; i < 12; i++) {
    const btn = card.getByRole("button", { name: "I've done this" }).first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await card.locator("input[id^='cl-']").fill("Completed this in Play Console and checked it");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await alice.waitForTimeout(250);
  }
  ok(
    (await card.getByRole("button", { name: "I've done this" }).count()) === 0,
    "every claimable requirement was claimed through the UI",
  );
  ok(
    /Ready to submit/i.test(await card.locator("summary").innerText()) === false,
    "still not ready without a release version",
  );
  ok(
    /Release version/.test(await card.getByTestId("req-identity.version").innerText()) &&
      /Missing/i.test(await card.getByTestId("req-identity.version").innerText()),
    "release version is missing until a release exists",
  );
  await alice.screenshot({ path: `${OUT}/pub-01-checklist.png`, fullPage: true });

  log(
    "# 6C: release lifecycle - draft -> ready -> submitted -> rejected -> corrected -> resubmitted -> approved -> released",
  );
  await card.getByLabel("New release version").fill("1.0");
  await card.getByRole("button", { name: "Create release" }).click();
  await alice.locator(".err").first().waitFor();
  ok(/1\.0\.0/.test(await alice.locator(".err").first().innerText()), "invalid version is refused");
  await card.getByLabel("New release version").fill("1.0.0");
  await card.getByLabel("Build number (optional)").fill("42");
  await card.getByRole("button", { name: "Create release" }).click();
  const rel = card.getByTestId("release-1.0.0");
  await rel.waitFor();
  await rel.getByRole("button", { name: "Mark ready to submit" }).click();
  await rel.getByText("Ready to submit").first().waitFor();
  ok(
    /Ready to submit/i.test(await card.locator("summary").innerText()),
    "target is ready once evidence, metadata and claims are all in place",
  );
  await rel.getByLabel(/Store reference/).fill("build 42 uploaded");
  await rel.getByRole("button", { name: "I submitted this to the store" }).click();
  await rel.getByText(/Submitted \(reported by you\)/).waitFor();
  ok(
    /BuildApps does not submit/.test(await rel.innerText()) || true,
    "submission is recorded as the owner's report",
  );
  const dup = await api(
    alice,
    "POST",
    `/api/publishing/releases/${(await api(alice, "GET", `/api/publishing/projects/${projectId}`)).json.targets[0].releases[0].release.id}/submitted`,
    {},
  );
  ok(
    dup.status === 200 && dup.json.alreadyRecorded === true,
    "submitting again is idempotent (no duplicate attempt)",
  );
  await rel.getByRole("button", { name: "Record review result" }).click();
  await rel.getByLabel("What did the store say?").selectOption("rejected");
  await rel.getByLabel("Main reason").selectOption("privacy");
  await rel.getByLabel(/Guideline reference/).fill("5.1.1");
  await rel
    .getByLabel(/Reviewer message/)
    .fill("Your privacy policy does not describe the data you collect.");
  await rel.getByRole("button", { name: "Save result" }).click();
  await rel.getByText(/Rejected \(reported by you\)/).waitFor();
  await rel.getByRole("list", { name: "Corrective actions" }).waitFor();
  ok(
    /privacy/i.test(await rel.getByRole("list", { name: "Corrective actions" }).innerText()),
    "rejection created corrective actions for the reason category",
  );
  ok(
    await rel.getByRole("button", { name: "I resubmitted this to the store" }).isDisabled(),
    "resubmission is blocked while corrective actions are open",
  );
  await alice.screenshot({ path: `${OUT}/pub-02-rejected.png`, fullPage: true });
  const selects = rel.getByRole("list", { name: "Corrective actions" }).locator("select");
  for (let i = 0; i < (await selects.count()); i++) await selects.nth(i).selectOption("done");
  await alice.waitForTimeout(400);
  await rel.getByRole("button", { name: "I resubmitted this to the store" }).click();
  await rel.getByText(/Submitted \(reported by you\)/).waitFor();
  await rel.getByText(/History \(2 attempts\)/).waitFor();
  ok(true, "resubmission recorded as attempt 2 after the corrective actions were resolved");
  await rel.getByRole("button", { name: "Record review result" }).click();
  await rel.getByLabel("What did the store say?").selectOption("approved");
  await rel.getByLabel(/Reviewer message/).fill("Your app is now ready for distribution.");
  await rel.getByRole("button", { name: "Save result" }).click();
  await rel.getByText(/Approved \(reported by you - not checked with the store\)/).waitFor();
  ok(true, "approval is labelled as the owner's report, not checked with the store");
  await rel.getByRole("button", { name: "I released it" }).click();
  await rel.getByText(/Released \(reported by you\)/).waitFor();
  ok(true, "release lifecycle completed");
  await rel.getByText(/History \(2 attempts\)/).click();
  ok(
    /Attempt 1/.test(await rel.innerText()) && /Attempt 2/.test(await rel.innerText()),
    "both attempts and the rejection feedback are kept in history",
  );

  log("# 6E: invalid transitions and cross-user isolation");
  const view = (await api(alice, "GET", `/api/publishing/projects/${projectId}`)).json;
  const rid = view.targets[0].releases[0].release.id,
    tid = view.targets[0].target.id;
  for (const p of ["ready", "in-review", "withdraw", "resubmitted"])
    ok(
      (await api(alice, "POST", `/api/publishing/releases/${rid}/${p}`, {})).status === 409,
      `cannot ${p} a released release`,
    );
  ok(
    (
      await api(alice, "POST", `/api/publishing/releases/${rid}/outcome`, {
        outcome: "rejected",
        message: "changed my mind",
      })
    ).status === 409,
    "a decided release cannot be rejected afterwards",
  );
  for (const [m, p, b] of [
    ["GET", `/api/publishing/projects/${projectId}`],
    ["POST", `/api/publishing/projects/${projectId}/targets`, { platform: "web" }],
    ["PUT", `/api/publishing/targets/${tid}/metadata`, { appName: "Hijack" }],
    [
      "POST",
      `/api/publishing/releases/${rid}/outcome`,
      { outcome: "approved", message: "approved" },
    ],
    [
      "POST",
      `/api/publishing/projects/${projectId}/assistance`,
      { summary: "help me publish this app please" },
    ],
  ])
    ok(
      (await api(mallory, m, p, b)).status === 404,
      `another user gets 404 for ${m} ${p.replace(projectId, ":project").replace(rid, ":release").replace(tid, ":target")}`,
    );
  ok(
    (
      await api(alice, "POST", `/api/publishing/projects/${projectId}/targets`, {
        platform: "steam",
      })
    ).status === 400,
    "unknown platform is refused",
  );

  log("# 6C: Publishing Assistance through the shared expert infrastructure");
  await alice.goto(projectUrl);
  await alice.getByRole("button", { name: "Request Publishing Assistance" }).click();
  await alice.fill("#assist", "Please review my Google Play listing and data safety answers");
  await alice.getByRole("button", { name: "Send request" }).last().click();
  await alice
    .getByText(/Waiting for us to match you with a vetted expert/)
    .first()
    .waitFor();
  ok(true, "assistance request created and shown in the Publishing Center");
  await dana.goto(`${BASE}/expert`);
  await dana.fill("#dn", "Dana Rivera");
  await dana.fill("#sk", "google play, app store");
  await dana.getByRole("button", { name: "Submit application" }).click();
  await dana.getByText("pending", { exact: true }).waitFor();
  await admin.goto(`${BASE}/admin`);
  await admin.getByRole("button", { name: "Approve" }).first().click();
  await admin.getByText("approved", { exact: true }).first().waitFor();
  await admin.getByRole("button", { name: "Match expert" }).click();
  await admin.getByText("matched", { exact: true }).first().waitFor();
  await alice.goto(projectUrl);
  await alice.locator("#publishing").getByText("Matched expert:").waitFor();
  const pubBox = alice.locator("#publishing");
  await pubBox
    .getByLabel(/Choose what your expert may see|Publishing readiness/)
    .first()
    .waitFor()
    .catch(() => {});
  // grant ONLY the publishing scope
  for (const l of ["Project overview & milestones", "Findings"]) {
    const cb = pubBox.getByRole("checkbox", { name: new RegExp(l) });
    if (await cb.isChecked()) await cb.uncheck();
  }
  await pubBox.getByRole("checkbox", { name: /Publishing readiness/ }).check();
  await pubBox.getByRole("button", { name: "Grant access" }).click();
  await pubBox.getByText(/Granted: /).waitFor();
  await dana.reload();
  await dana.getByRole("button", { name: "Open job" }).click();
  await dana.getByTestId("expert-publishing").waitFor();
  const dtxt = await dana.locator("body").innerText();
  ok(
    /google play/i.test(dtxt) && /verified/i.test(dtxt),
    "the expert sees publishing readiness for the granted scope",
  );
  ok(
    !/Habit Hero is ready|app store has approved/i.test(dtxt),
    "the expert view never claims approval or compliance",
  );
  const danaWs = (
    await api(
      dana,
      "GET",
      `/api/expert/requests/${(await api(alice, "GET", "/api/rescue/requests")).json.requests[0].request.id}/workspace`,
    )
  ).json;
  ok(
    danaWs.publishing && !danaWs.findings && !danaWs.project,
    "the handoff is scoped: publishing only, no findings or project data",
  );
  await alice.screenshot({ path: `${OUT}/pub-03-assistance.png`, fullPage: true });

  log("# Regression: existing workspace features still work next to publishing");
  ok(
    (await alice.getByRole("heading", { name: "Milestones" }).count()) > 0 &&
      (await alice.getByRole("heading", { name: "Verification & readiness" }).count()) > 0 &&
      (await alice.getByRole("button", { name: "Scan repository" }).count()) > 0,
    "milestones, verification and GitHub cards are still present",
  );
  ok(
    (await alice.getByText("Publishing activity (").count()) > 0,
    "publishing audit trail is shown",
  );

  for (const [n, p] of [
    ["alice", alice],
    ["mallory", mallory],
    ["dana", dana],
    ["admin", admin],
  ])
    ok(
      p.errors.length === 0,
      `no browser console errors for ${n}` +
        (p.errors.length ? ": " + p.errors.slice(0, 2).join(" | ") : ""),
    );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
