/* eslint-disable */
// Personalized onboarding, placement checks, daily goal. Needs a fresh dev server (see README).
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
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.dev = "vera";
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`${BASE}/login`);
  await page.fill("#dn", "vera");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/onboarding");

  log("# wizard: required answers gate progress");
  const cont = page.getByRole("button", { name: "Continue" });
  ok(await cont.isDisabled(), "cannot continue without answering");
  await page.getByRole("radio", { name: /Experienced/ }).click();
  await cont.click();
  ok(
    await page.getByRole("heading", { name: /want to get out of this/ }).isVisible(),
    "moves to goals",
  );
  await page.getByRole("button", { name: "Back" }).click();
  ok(
    (await page.getByRole("radio", { name: /Experienced/ }).getAttribute("aria-checked")) ===
      "true",
    "Back keeps the answer",
  );
  await cont.click();
  await page.getByRole("checkbox", { name: /Level up my skills/ }).click();
  await cont.click();
  await page.getByRole("checkbox", { name: /Cursor/ }).click();
  await page.getByRole("checkbox", { name: /Lovable/ }).click();
  await cont.click();
  await page.getByRole("radio", { name: /Learn first/ }).click();
  await cont.click();
  await page.getByRole("radio", { name: /Intense/ }).click();
  await cont.click();
  await page.getByRole("checkbox", { name: /Web app/ }).click();
  await page.getByRole("checkbox", { name: /^Web Runs in the browser/ }).click();
  await cont.click();
  await page.getByLabel("Remind me to practise").check();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await page.waitForURL("**/learn");
  const plan = page.getByTestId("plan");
  await plan.waitFor();
  ok(true, "a learn-first profile lands on the learning path with a plan");
  ok(
    (await page.getByTestId("daily-goal").innerText()).includes("0 / 80 XP"),
    "intense pace sets an 80 XP daily goal",
  );
  ok(
    (await page.getByTestId("personalize-banner").count()) === 0,
    "the personalize banner disappears once a profile exists",
  );
  ok(
    (await plan.innerText()).toLowerCase().includes("skip check: how apps work"),
    "experienced learners are offered skill checks",
  );

  log("# server validation and isolation");
  ok(
    (await api(page, "PUT", "/api/profile", { experience: "wizard" })).status === 400,
    "invalid profile refused",
  );
  const saved = (await api(page, "GET", "/api/profile")).json.profile;
  ok(
    saved.profile.pace === "intense" && saved.placedOut.length === 0,
    "profile persisted, no placement yet",
  );
  const stranger = await ctx.newPage();
  stranger.dev = "other-vera";
  await stranger.goto(`${BASE}/login`);
  ok(
    (await api(stranger, "GET", "/api/profile")).json.profile === null,
    "another account has no profile",
  );
  ok(
    (await api(stranger, "GET", "/api/placement/app-anatomy")).status === 409,
    "skill checks need onboarding first",
  );
  ok(
    (await api(page, "GET", "/api/placement/databases")).status === 403,
    "locked skills cannot be checked",
  );

  log("# skill check: failing first, then passing");
  await page.goto(`${BASE}/learn/check/app-anatomy`);
  await page.getByRole("heading", { name: /Skill check/ }).waitFor();
  for (let q = 0; q < 4; q++) {
    // answer without thinking: submit whatever the default draft is
    await page
      .getByRole("button", { name: q < 3 ? "Next" : "Submit answers", exact: true })
      .click();
  }
  await page.getByRole("heading", { name: "Not quite yet" }).waitFor();
  ok(true, "a blind attempt does not place out");
  ok(
    (await api(page, "GET", "/api/profile")).json.profile.placedOut.length === 0,
    "nothing was recorded",
  );
  const dash0 = (await api(page, "GET", "/api/dashboard")).json;
  ok(dash0.totalXp === 0, "no XP for a failed check");

  // pass through the API with the real solutions (the UI uses the same endpoint)
  const sol = require("fs").existsSync("/tmp/solutions.json")
    ? JSON.parse(require("fs").readFileSync("/tmp/solutions.json", "utf8"))
    : null;
  ok(!!sol, "solutions export available");
  const check = (await api(page, "GET", "/api/placement/app-anatomy")).json.check;
  const answers = {};
  for (const c of check.exercises) {
    const ex = sol.flatMap((l) => l.exercises).find((e) => e.id === c.id);
    answers[c.id] =
      ex.type === "sequence"
        ? { type: "sequence", order: ex.solution }
        : ex.type === "bug_hunt"
          ? { type: "bug_hunt", lineIds: ex.solution }
          : ex.type === "match"
            ? { type: "match", placements: ex.solution }
            : ex.type === "scenario"
              ? { type: "scenario", optionId: ex.solution }
              : { type: "word_bank", fills: ex.solution };
  }
  const pass = await api(page, "POST", "/api/placement/app-anatomy", { answers });
  ok(pass.json.passed === true, "correct answers pass the check");
  ok(!JSON.stringify(pass.json).includes("explanation"), "the response reveals no explanations");
  const dash1 = (await api(page, "GET", "/api/dashboard")).json;
  const sk = dash1.path.skills.find((s) => s.skillId === "app-anatomy");
  ok(
    dash1.totalXp === 0 && sk.level === "none" && sk.unlocked,
    "unlocked, but no XP and no mastery was awarded",
  );
  ok(dash1.path.skills.find((s) => s.skillId === "frontend").unlocked, "dependent skills unlock");
  ok(
    (await api(page, "GET", "/api/lessons/front-1")).status === 200,
    "dependent lessons can now be opened",
  );
  ok(
    dash1.achievements.every((a) => !a.earned),
    "no achievements were granted",
  );
  ok(
    (await api(page, "GET", "/api/placement/app-anatomy")).status === 409,
    "a passed check cannot be repeated",
  );
  await page.goto(`${BASE}/learn`);
  await page.getByTestId("plan").waitFor();
  ok(
    !(await page.getByTestId("plan").innerText())
      .toLowerCase()
      .includes("skip check: how apps work"),
    "the offer disappears after passing",
  );

  log("# editing the plan keeps placement");
  await page.goto(`${BASE}/onboarding?edit=1`);
  await page.getByRole("radio", { name: /Experienced/ }).waitFor();
  ok(
    (await page.getByRole("radio", { name: /Experienced/ }).getAttribute("aria-checked")) ===
      "true",
    "edit mode loads current answers",
  );
  ok(
    (await api(page, "PUT", "/api/profile", { ...saved.profile, pace: "light" })).status === 200,
    "profile can be edited",
  );
  ok(
    (await api(page, "GET", "/api/profile")).json.profile.placedOut.includes("app-anatomy"),
    "editing keeps passed skill checks",
  );

  ok(errors.length === 0, "no browser console errors");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
