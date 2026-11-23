/* eslint-disable */
// Cross-platform shared state: the API client that the MOBILE app ships, and the WEB UI in a browser, against ONE backend.
// Run with: node --experimental-transform-types e2e/parity-flows.js   (fresh dev server)
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

(async () => {
  const { createApiClient } = await import("../../../packages/api-client/src/index.ts");
  // exactly how apps/mobile/src/lib/session.ts builds its client (bearer token + baseUrl); dev token instead of a Supabase session
  const mobile = createApiClient({ baseUrl: BASE, getToken: async () => "dev:carol" });

  log("# mobile -> web: data written through the mobile client appears in the web UI");
  const project = await mobile.createProject({
    journey: "start",
    name: "Shared Habit App",
    idea: "A habit tracker for students with streaks",
    platform: "cross_platform",
  });
  await mobile.setProjectState(project.id, "active");
  const target = (await mobile.publishing.addTarget(project.id, "apple_app_store")).target;
  await mobile.publishing.saveMetadata(target.id, {
    appName: "Shared Habit",
    bundleId: "com.example.shared",
    privacyPolicyUrl: "https://example.com/privacy",
  });
  await mobile.publishing.claim(
    target.id,
    "apple.developer-account",
    "self_reported",
    "Enrolled in the Apple Developer Program",
  );
  await mobile.publishing.createRelease(target.id, "1.0.0", "7");
  await mobile.reportMilestone(project.id, "define-scope");
  const mobileView = await mobile.publishing.view(project.id);
  ok(
    mobileView.targets.length === 1 && mobileView.targets[0].releases.length === 1,
    "mobile client created target + release",
  );

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.fill("#dn", "carol");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/onboarding");
  await page.goto(`${BASE}/projects/${project.id}`);
  await page.getByRole("heading", { name: "Shared Habit App" }).waitFor();
  const card = page.getByTestId("target-apple_app_store");
  await card.waitFor();
  ok(/Apple App Store/.test(await card.innerText()), "web shows the target created on mobile");
  ok(
    /Shared Habit/.test(await card.getByLabel("App name (max 30)").inputValue()),
    "web shows the listing details saved on mobile",
  );
  ok(
    /Self-reported/i.test(await card.getByTestId("req-apple.developer-account").innerText()),
    "web shows the requirement claim recorded on mobile (as self-reported)",
  );
  await card.getByTestId("release-1.0.0").waitFor();
  ok(true, "web shows the release created on mobile");
  const ms = await page
    .getByText("Define scope")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'ms')]")
    .innerText();
  ok(/Self-reported/i.test(ms), "web shows the milestone self-reported on mobile");

  log("# web -> mobile: data written in the browser is visible through the mobile client");
  await card.getByLabel("Support URL (https)").fill("https://example.com/support");
  await card.getByRole("button", { name: "Save listing details" }).click();
  await page.getByText("Listing details saved.").waitFor();
  await card
    .getByTestId("release-1.0.0")
    .getByLabel("Add a task")
    .fill("Update screenshots for 6.7-inch devices");
  await card.getByTestId("release-1.0.0").getByRole("button", { name: "Add task" }).click();
  await card.getByText("Update screenshots for 6.7-inch devices", { exact: true }).waitFor();
  const after = await mobile.publishing.view(project.id);
  ok(
    after.targets[0].target.metadata.supportUrl === "https://example.com/support",
    "mobile client sees the listing detail saved in the browser",
  );
  ok(
    after.targets[0].releases[0].actions.some(
      (a) => a.title === "Update screenshots for 6.7-inch devices",
    ),
    "mobile client sees the task added in the browser",
  );
  await mobile.publishing.updateAction(after.targets[0].releases[0].actions[0].id, "done");
  await card
    .getByTestId("release-1.0.0")
    .getByLabel(/Status of Update screenshots/)
    .waitFor();
  await page.reload();
  const sel = page.getByTestId("target-apple_app_store").getByLabel(/Status of Update screenshots/);
  ok((await sel.inputValue()) === "done", "web shows the task status changed from mobile");

  log("# one account, one set of rules on both platforms");
  const [wsMobile] = await Promise.all([mobile.workspace(project.id)]);
  ok(
    wsMobile.project.name === "Shared Habit App" && wsMobile.readiness.ready === false,
    "workspace/readiness computed by the server is identical for both clients",
  );
  let refused = null;
  try {
    await mobile.publishing.claim(
      target.id,
      "build.ci-passing",
      "self_reported",
      "I say CI is green",
    );
  } catch (e) {
    refused = e;
  }
  ok(
    refused && refused.status === 400,
    "the server refuses an unsupported claim from the mobile client exactly as from web",
  );
  const other = createApiClient({ baseUrl: BASE, getToken: async () => "dev:dave" });
  let denied = null;
  try {
    await other.publishing.view(project.id);
  } catch (e) {
    denied = e;
  }
  ok(denied && denied.status === 404, "a different account sees nothing, on any client");
  ok(
    errors.length === 0,
    "no browser console errors" + (errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
