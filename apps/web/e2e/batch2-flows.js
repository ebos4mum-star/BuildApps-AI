/* eslint-disable */
// Stage 3-5 end-to-end: GitHub connect -> scan -> findings -> verification -> expert rescue lifecycle.
// Run against `DEV_MEMORY_BACKEND=1 NEXT_PUBLIC_DEV_BACKEND=1 next dev -p 3100` (fresh server).
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
  alice.dev = "alice";
  const dana = await user(browser, "dana");
  dana.dev = "dana";
  const admin = await user(browser, "admin");
  admin.dev = "admin";

  log("# Stage 3: connect GitHub (read-only), link a repository");
  await alice.goto(`${BASE}/projects/new?journey=rescue`);
  await alice.fill("#name", "Stuck app");
  await alice.fill("#repo", "https://github.com/demo/stuck-app");
  await alice.fill("#problem", "The build is broken after the AI rewrote my payments code");
  await alice.getByRole("button", { name: "Create project" }).click();
  await alice.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  const projectUrl = alice.url();
  await alice.getByText("GitHub repository").waitFor();
  ok(
    (await alice.getByText(/Read-only access/).count()) > 0,
    "read-only access is explained before connecting",
  );
  await alice.getByRole("button", { name: "Connect GitHub (read-only)" }).click();
  await alice.waitForURL(/\/projects\?github=connected/);
  await alice.getByText(/GitHub connected \(read-only\)/).waitFor();
  ok(true, "install redirect completes via signed state + proof of installation access");
  await alice.goto(projectUrl);
  await alice.getByLabel("Repository for this project").waitFor();
  ok(
    (await alice.getByLabel("Repository for this project").inputValue()) === "demo/stuck-app",
    "project's own repository is preselected",
  );
  await alice.getByRole("button", { name: "Link repository" }).click();
  await alice.getByText("Linked demo/stuck-app.").waitFor();
  await alice.getByRole("button", { name: "Scan repository" }).waitFor();
  ok(true, "repository linked; scan/verify/disconnect actions appear");

  log("# Stage 3: scan -> evidence-based, classified, redacted findings");
  await alice.getByRole("button", { name: "Scan repository" }).click();
  await alice.getByText(/Scan complete\./).waitFor();
  await alice
    .getByRole("heading", { name: "Environment file committed to the repository" })
    .waitFor();
  const page1 = await alice.content();
  ok(
    /Verified in repo/.test(page1) &&
      /Static warning/.test(page1) &&
      /Unverified recommendation/.test(page1),
    "all three evidence classes are shown with distinct labels",
  );
  ok(
    !/Zq81LmN4pR7sT0uVwX2yAb3C/.test(page1) && !/sk_live_Zq/.test(page1),
    "secret values never reach the page (redacted)",
  );
  ok(/redacted \d+ chars/.test(page1), "redaction marker is visible instead of the value");
  ok(
    (await alice.getByText("Verified", { exact: true }).count()) >= 1,
    "'assess' milestone shows Verified from scan evidence",
  );
  ok(/Evidence: repository scan/.test(page1), "verified milestone cites its evidence");
  await alice.screenshot({ path: `${OUT}/b2-01-findings.png`, fullPage: true });

  log("# Stage 4: user claims cannot be treated as verified; rescans reopen/keep decisions");
  const sel = (title) =>
    alice
      .locator("li.finding", { has: alice.getByRole("heading", { name: title }) })
      .getByRole("combobox");
  await sel("Environment file committed to the repository").selectOption("resolved");
  await alice.getByText(/Resolved and dismissed \(/).click();
  await alice.getByText(/resolved \(your claim, re-checked on next scan\)/).waitFor();
  const v1 = await api(alice, "GET", `/api/workspace/${projectUrl.split("/").pop()}`);
  ok(
    v1.json.readiness.ready === false &&
      v1.json.readiness.blockers.some((b) => /critical\/high/.test(b)),
    "a self-resolved critical finding still blocks readiness",
  );
  const dismissTitle = (v1.json.findings.find((f) => f.ruleId === "sql-string-building") ?? {})
    .title;
  await sel(dismissTitle).selectOption("dismissed");
  await alice.getByLabel(/Why are you dismissing this/).fill("Query only takes internal ids");
  await alice.getByRole("button", { name: "Save decision" }).click();
  await alice.getByText(/dismissed: Query only takes internal ids/).waitFor({ state: "attached" });
  await alice.getByRole("button", { name: "Scan repository" }).click();
  await alice.getByText(/Scan complete\./).waitFor();
  await alice.waitForTimeout(300);
  const v2 = await api(alice, "GET", `/api/workspace/${projectUrl.split("/").pop()}`);
  const env = v2.json.findings.find((f) => f.ruleId === "env-file-committed");
  const sql = v2.json.findings.find((f) => f.ruleId === "sql-string-building");
  ok(
    env.status === "open",
    "rescan reopened the claimed-fixed finding because the evidence is still there",
  );
  ok(
    sql.status === "dismissed" && sql.statusNote === "Query only takes internal ids",
    "the user's dismissal decision (and reason) survived the rescan",
  );
  const fixBlockers = v2.json.project.milestones.find((m) => m.id === "fix-blockers");
  ok(
    fixBlockers.status === "todo",
    "'Fix blocking problems' is NOT verified while serious findings remain",
  );

  log("# Stage 4: verification run; runtime verification is honestly unavailable");
  await alice.getByRole("button", { name: "Run verification" }).click();
  await alice.getByText(/Verification recorded\./).waitFor();
  await alice.getByText("Tests executed in an isolated sandbox").waitFor();
  const body = await alice.locator("body").innerText();
  ok(
    /Tests executed in an isolated sandbox\s*\n?\s*Unavailable/i.test(body) ||
      /isolated sandbox[\s\S]{0,40}Unavailable/i.test(body),
    "sandboxed test execution is clearly marked Unavailable",
  );
  ok(
    /Repository CI passes on the latest commit[\s\S]{0,40}Failed/i.test(body),
    "failing repository CI is reported as failed",
  );
  ok(/Not ready to publish yet/i.test(body), "readiness says not ready");
  await alice.screenshot({ path: `${OUT}/b2-02-verification.png`, fullPage: true });

  log("# Stage 5: expert vetting, request from the project, manual match");
  // ask from a specific finding: the request is pre-filled with that finding
  await alice
    .locator("li.finding", {
      has: alice.getByRole("heading", { name: "Possible hardcoded secret in src/lib/pay.ts" }),
    })
    .getByRole("button", { name: "Ask an expert about this" })
    .click();
  const prefilled = await alice.locator("#help").inputValue();
  ok(
    /Possible hardcoded secret in src\/lib\/pay\.ts/.test(prefilled),
    "asking about a finding pre-fills the request with that finding",
  );
  await alice.getByRole("button", { name: "Send request" }).click();
  await alice.getByText(/Waiting for us to match you with a vetted expert/).waitFor();
  ok(true, "owner request is queued from the project workspace");

  await dana.goto(`${BASE}/expert`);
  await dana.fill("#dn", "Dana Rivera");
  await dana.fill("#hl", "Full-stack rescue for AI-built apps");
  await dana.fill("#sk", "next.js, supabase, security");
  await dana.getByRole("button", { name: "Submit application" }).click();
  await dana.getByText("pending", { exact: true }).waitFor();
  ok((await dana.getByText("Your jobs").count()) === 0, "an unapproved expert cannot see jobs");

  await admin.goto(`${BASE}/admin`);
  await admin.getByText("Expert applications").waitFor();
  ok(
    await alice.goto(`${BASE}/admin`).then(() =>
      alice
        .getByText(/for BuildApps administrators/)
        .waitFor()
        .then(() => true),
    ),
    "a normal user is refused the admin area",
  );
  await admin.getByRole("button", { name: "Approve" }).first().click();
  await admin.getByText("approved", { exact: true }).first().waitFor();
  await admin.getByRole("button", { name: "Match expert" }).click();
  await admin.getByText("matched", { exact: true }).first().waitFor();
  ok(true, "admin approved the expert and manually matched the request");

  log("# Stage 5: scoped, time-limited handoff");
  await alice.goto(projectUrl);
  await alice.getByText("Matched expert:").waitFor();
  await dana.goto(`${BASE}/expert`);
  await dana.getByRole("button", { name: "Open job" }).click();
  await dana
    .getByText("No access granted.")
    .waitFor()
    .catch(() => {});
  ok(
    /access|owner has not granted/i.test(await dana.locator("body").innerText()),
    "expert sees no project data before the owner grants access",
  );
  await alice.getByRole("button", { name: "Grant access" }).click();
  await alice.getByText(/Granted: /).waitFor();
  await dana.reload();
  await dana.getByRole("button", { name: "Open job" }).click();
  await dana.getByText(/Granted by the owner until/).waitFor();
  const danaText = await dana.locator("body").innerText();
  ok(/Environment file committed/.test(danaText), "expert sees the findings the owner shared");
  ok(!/Zq81LmN4pR7sT0uVwX2yAb3C/.test(await dana.content()), "expert never sees secret values");
  await alice.screenshot({ path: `${OUT}/b2-03-handoff.png`, fullPage: true });

  log("# Stage 5: deliver -> owner requests revision -> resubmit -> accept -> complete");
  await dana.getByRole("button", { name: "Accept job" }).click();
  await dana.getByLabel("Add a milestone").fill("Remove committed .env and rotate keys");
  await dana.getByRole("button", { name: "Add milestone" }).click();
  await dana.getByText("Remove committed .env and rotate keys").waitFor();
  await dana.getByRole("button", { name: "Submit work" }).click();
  await dana
    .getByLabel("What did you do?")
    .fill("Removed .env from git and rotated the Stripe key");
  await dana.getByLabel(/Link to the work/).fill("https://github.com/demo/stuck-app/pull/1");
  await dana.getByRole("button", { name: "Submit for owner review" }).click();
  await dana.getByRole("button", { name: "Mark delivered" }).click();
  await alice.goto(projectUrl);
  await alice.getByText(/Expert says the work is delivered/).waitFor();
  await alice.getByRole("button", { name: "Needs changes" }).click();
  await alice.getByLabel("What needs to change?").fill("The key is still in git history");
  await alice.getByRole("button", { name: "Send feedback" }).click();
  await alice
    .getByText(/In progress/)
    .first()
    .waitFor();
  ok(true, "owner requested a revision; the job reopened");
  await dana.reload();
  await dana.getByRole("button", { name: "Open job" }).click();
  await dana.getByText(/Owner feedback: The key is still in git history/).waitFor();
  await dana.getByRole("button", { name: "Submit work" }).click();
  await dana
    .getByLabel("What did you do?")
    .fill("Purged history with git filter-repo and force-rotated all keys");
  await dana.getByRole("button", { name: "Submit for owner review" }).click();
  await dana.getByRole("button", { name: "Mark delivered" }).click();
  await alice.goto(projectUrl);
  await alice.getByRole("button", { name: "Accept" }).first().click();
  await alice.getByRole("button", { name: "Confirm job complete" }).click();
  await alice
    .getByText(/Completed/)
    .first()
    .waitFor();
  ok(true, "rejected work was corrected, resubmitted, accepted and the job completed");
  const req = (await api(alice, "GET", "/api/rescue/requests")).json.requests[0];
  ok(
    req.request.status === "completed" && req.request.completionEvidence.latestScanId,
    "completion is recorded with scan evidence links",
  );
  const acts = req.events.map((e) => e.action);
  ok(
    [
      "request_created",
      "matched",
      "handoff_granted",
      "accepted",
      "revision_requested",
      "milestone_accepted",
      "handoff_revoked",
      "completed",
    ].every((a) => acts.includes(a)),
    "job activity trail records every step",
  );
  await alice.goto(projectUrl);
  await alice.getByText(/Job activity \(/).click();
  ok(
    /Revision requested/i.test(await alice.locator("body").innerText()),
    "owner sees the activity timeline in the UI",
  );
  ok(req.handoff === null, "expert access ended automatically at completion");
  const danaWs = await api(dana, "GET", `/api/expert/requests/${req.request.id}/workspace`);
  ok(danaWs.status === 403, "expert workspace is closed after completion");
  await alice.screenshot({ path: `${OUT}/b2-04-completed.png`, fullPage: true });

  log("# Stage 3: disconnect revokes access");
  await alice.goto(projectUrl);
  await alice.getByRole("button", { name: "Disconnect & revoke" }).click();
  await alice.getByText("Disconnected. GitHub access was revoked.").waitFor();
  await alice.getByRole("button", { name: "Connect GitHub (read-only)" }).waitFor();
  const after = await api(alice, "POST", `/api/workspace/${projectUrl.split("/").pop()}/scan`, {});
  ok(
    after.status === 409 && after.json.error.code === "not_connected",
    "scanning after disconnect is refused",
  );

  // help is available from any journey, not just rescue
  await alice.goto(`${BASE}/projects/new?journey=start`);
  await alice.fill("#name", "Habit tracker");
  await alice.fill("#idea", "A habit tracker for students with streaks");
  await alice.getByRole("button", { name: "Create project" }).click();
  await alice.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  await alice.getByRole("button", { name: "Ask a vetted developer for help" }).click();
  await alice.fill("#help", "I want a review of my app before I launch it");
  await alice.getByRole("button", { name: "Send request" }).click();
  await alice.getByText(/Waiting for us to match you with a vetted expert/).waitFor();
  ok(true, "a Start-journey project can request expert help too");

  for (const [n, p] of [
    ["alice", alice],
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
