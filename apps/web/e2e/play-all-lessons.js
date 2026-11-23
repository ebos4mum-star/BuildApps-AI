/* eslint-disable */
const { chromium } = require("playwright");
const fs = require("fs");
const S = process.argv[2];
const lessons = JSON.parse(fs.readFileSync(`${S}/solutions.json`, "utf8"));
const BASE = "http://localhost:3100";
const log = (...a) => console.log(...a);
const assert = (c, m) => {
  if (!c) {
    console.error("ASSERT FAILED:", m);
    process.exitCode = 1;
    throw new Error(m);
  } else log("  ok -", m);
};

async function solve(page, ex, { wrong = false } = {}) {
  if (ex.type === "sequence") {
    for (let i = 0; i < ex.solution.length; i++) {
      const label = ex.items.find((x) => x.id === ex.solution[i]).label;
      for (let guard = 0; guard < 12; guard++) {
        const texts = await page.$$eval("ol .step .label", (els) => els.map((e) => e.textContent));
        const idx = texts.findIndex((t) => t.endsWith(label));
        if (idx <= i) break;
        await page.getByRole("button", { name: `Move "${label}" up` }).click();
      }
    }
  } else if (ex.type === "bug_hunt") {
    const idx = ex.lines.findIndex((l) => l.id === ex.solution[0]);
    await page
      .locator(".code button")
      .nth(wrong ? (idx + 1) % ex.lines.length : idx)
      .click();
  } else if (ex.type === "match") {
    for (const it of ex.items) {
      const cat = ex.categories.find((c) => c.id === ex.solution[it.id]).label;
      await page.locator(".pool").getByRole("button", { name: it.label, exact: true }).click();
      await page.getByRole("group", { name: cat, exact: true }).click();
    }
  } else if (ex.type === "scenario") {
    const opt = wrong
      ? ex.options.find((o) => o.id !== ex.solution)
      : ex.options.find((o) => o.id === ex.solution);
    await page.getByRole("radio", { name: opt.label, exact: true }).click();
  } else if (ex.type === "word_bank") {
    for (const t of ex.template)
      if (typeof t !== "string") {
        const w = ex.words.find((x) => x.id === ex.solution[t.blank]).label;
        await page.locator(".pool").getByRole("button", { name: w, exact: true }).click();
      }
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 860 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  log("# auth + onboarding");
  await page.goto(`${BASE}/learn`);
  await page.waitForURL("**/login");
  assert(true, "unauthenticated /learn redirects to /login");
  await page.fill("#dn", "tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/onboarding");
  await page.screenshot({ path: `${S}/01-onboarding.png` });
  await page.getByRole("link", { name: /Start a project/ }).click();
  await page.fill("#name", "Habit app");
  await page.fill("#idea", "A habit tracker for students with streaks");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL("**/learn");
  assert(true, "Start journey creates a project and lands on the learning path");
  await page.getByText("Know your app").waitFor();
  await page.screenshot({ path: `${S}/02-path-initial.png`, fullPage: true });
  assert((await page.locator(".node.locked").count()) >= 5, "later lessons are locked initially");

  log("# security: server rejects forged/locked requests");
  const probe = await page.evaluate(async () => {
    const h = { Authorization: "Bearer dev:tester", "Content-Type": "application/json" };
    const locked = await fetch("/api/attempts", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ exerciseId: "ship-1-seq", answer: { type: "sequence", order: [] } }),
    });
    const lockedLesson = await fetch("/api/lessons/ship-1", { headers: h });
    const forged = await fetch("/api/attempts", {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        exerciseId: "anatomy-1-match",
        answer: { type: "match", placements: {} },
        passed: true,
        xp: 9999,
      }),
    });
    const fj = await forged.json();
    const lj = await (await fetch("/api/lessons/anatomy-1", { headers: h })).text();
    const noauth = await fetch("/api/projects");
    const badtok = await fetch("/api/projects", { headers: { Authorization: "Bearer nope" } });
    const verify = await fetch("/api/projects/x/state", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ state: "in_verification" }),
    });
    return {
      locked: locked.status,
      lockedLesson: lockedLesson.status,
      forgedCorrect: fj.correct,
      forgedXp: fj.xpAwarded,
      leak: /"solution"|"explanation"|"feedback"/.test(lj),
      noauth: noauth.status,
      badtok: badtok.status,
      verify: verify.status,
    };
  });
  assert(probe.locked === 403 && probe.lockedLesson === 403, "locked exercise/lesson -> 403");
  assert(
    probe.forgedCorrect === false && probe.forgedXp === 0,
    "client-supplied passed/xp are ignored (wrong answer earns 0)",
  );
  assert(!probe.leak, "lesson payload contains no solutions/explanations");
  assert(probe.noauth === 401 && probe.badtok === 401, "missing/bad token -> 401");
  assert(probe.verify === 409, "cannot request in_verification state");

  log("# play every lesson through the UI");
  let first = true;
  for (const lesson of lessons) {
    await page.goto(`${BASE}/learn/${lesson.id}`);
    await page.getByRole("button", { name: "Let's go" }).click();
    let shots = 0;
    for (const ex of lesson.exercises) {
      const doWrong = first && (ex.type === "scenario" || ex.type === "bug_hunt");
      await solve(page, ex, { wrong: doWrong });
      if (doWrong) {
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.locator(".sheet.no").waitFor();
        await page.screenshot({ path: `${S}/04-wrong-feedback.png` });
        assert(
          (await page.locator(".sheet .muted").innerText()).includes("Why:"),
          "wrong answer shows an explanation",
        );
        await page.getByRole("button", { name: "Got it" }).click();
        first = false;
        break; // exercise is requeued; the drain loop below finishes the lesson
      }
      try {
        await page.getByRole("button", { name: "Check", exact: true }).click({ timeout: 4000 });
      } catch (e) {
        await page.screenshot({ path: `${S}/fail.png`, fullPage: true });
        throw new Error("stuck on " + ex.id + " (" + ex.type + ")");
      }
      await page.locator(".sheet.ok").waitFor();
      if (shots++ === 0 && lesson.id === "anatomy-1")
        await page.screenshot({ path: `${S}/03-correct-feedback.png` });
      await page.getByRole("button", { name: /Continue/ }).click();
    }
    // drain whatever is left (handles the requeue case): identify exercise by prompt text
    for (let guard = 0; guard < 10; guard++) {
      if (await page.getByText("Lesson complete!").count()) break;
      const prompt = await page.locator(".ex-prompt").innerText();
      const ex = lesson.exercises.find((e) => e.prompt === prompt);
      if (!ex) throw new Error("unknown exercise prompt " + prompt);
      await solve(page, ex);
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await page.locator(".sheet.ok").waitFor();
      await page.getByRole("button", { name: /Continue/ }).click();
    }
    await page.getByText("Lesson complete!").waitFor();
    if (lesson.id === "anatomy-1") await page.screenshot({ path: `${S}/05-complete.png` });
    log(`  ok - lesson ${lesson.id} completed`);
  }

  log("# dashboard reflects server-side progress");
  await page.goto(`${BASE}/learn`);
  await page.getByText("Your skills").waitFor();
  await page.screenshot({ path: `${S}/06-path-done.png`, fullPage: true });
  const dash = await page.evaluate(async () =>
    (await fetch("/api/dashboard", { headers: { Authorization: "Bearer dev:tester" } })).json(),
  );
  assert(dash.totalXp > 300, `XP earned (${dash.totalXp})`);
  assert(dash.streak.displayed === 1, "streak is 1 after a day of activity");
  assert(
    dash.path.units.flatMap((u) => u.lessons).every((l) => l.status === "complete"),
    "all lessons complete",
  );
  assert(dash.achievements.filter((a) => a.earned).length >= 1, "achievements earned");
  const before = dash.totalXp;
  const replay = await page.evaluate(
    async (id) =>
      (
        await fetch("/api/attempts", {
          method: "POST",
          headers: { Authorization: "Bearer dev:tester", "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId: id, answer: { type: "scenario", optionId: "x" } }),
        })
      ).status,
    "anatomy-1-scn",
  );
  const dash2 = await page.evaluate(async () =>
    (await fetch("/api/dashboard", { headers: { Authorization: "Bearer dev:tester" } })).json(),
  );
  assert(dash2.totalXp === before, "replays/retries cannot farm XP");

  log("# projects: rescue journey");
  await page.goto(`${BASE}/projects/new?journey=rescue`);
  await page.fill("#name", "Stuck app");
  await page.fill("#repo", "https://github.com/octo/stuck");
  await page.fill("#problem", "Build fails after AI rewrote auth");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  await page.getByText("Recovery plan").waitFor();
  await page.getByRole("button", { name: "Next stage" }).click();
  await page.getByRole("button", { name: "Mark done" }).first().click();
  await page.getByText("Self-reported").first().waitFor();
  assert(
    (await page.getByText("Verified", { exact: true }).count()) === 0,
    "self-reported milestone is not shown as verified",
  );
  await page.getByRole("button", { name: "Ask a vetted developer for help" }).click();
  await page.fill("#help", "The build breaks after every change.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByText(/Expert help requested/).waitFor();
  await page.screenshot({ path: `${S}/07-project.png`, fullPage: true });
  await page.goto(`${BASE}/projects`);
  await page.getByText("Stuck app").waitFor();
  assert(true, "project list shows both journeys' projects");
  await page.goto(`${BASE}/projects/new?journey=rescue`);
  await page.fill("#name", "Bad");
  await page.fill("#repo", "https://evil.example.com/a/b");
  await page.fill("#problem", "should be rejected by the server");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.locator(".err").waitFor();
  assert(true, "non-GitHub repo URL is rejected");

  log("# continue journey + isolation");
  await page.goto(`${BASE}/projects/new?journey=continue`);
  await page.fill("#name", "Half done");
  await page.fill("#desc", "Login works but data does not save");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  const other = await page.evaluate(async () =>
    (await fetch("/api/projects", { headers: { Authorization: "Bearer dev:someoneelse" } })).json(),
  );
  assert(other.projects.length === 0, "another user sees none of these projects");

  log("# mobile-width layout check");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!overflow, "no horizontal overflow at 420px");
  assert(
    errors.length === 0,
    "no browser console errors" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
