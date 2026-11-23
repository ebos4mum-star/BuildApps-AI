import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  evaluateCiChecks,
  runStaticChecks,
  scanSnapshot,
  selectFilesToFetch,
  MAX_FETCH_FILES,
  type RepoSnapshot,
} from "./index";

/** Builds a snapshot from path -> content (string = fetched text, number = unfetched file size). */
function snap(
  files: Record<string, string | number>,
  extra: Partial<RepoSnapshot> = {},
): RepoSnapshot {
  const tree = Object.entries(files).map(([path, v]) => ({
    path,
    size: typeof v === "string" ? v.length : v,
  }));
  const contents = Object.fromEntries(
    Object.entries(files).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  return { tree, contents, truncated: false, ...extra };
}
// Assembled at runtime so this test file itself never contains a scannable credential.
const FAKE_STRIPE = "sk_" + "live_" + "Zq81LmN4pR7sT0uVwX2yAb3C";
const FAKE_AWS = "AK" + "IA" + "QWERTYUIOPASDFGH";

const HEALTHY = snap({
  "package.json": JSON.stringify({
    name: "ok",
    scripts: { build: "next build", test: "vitest run" },
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { vitest: "^3.0.0" },
  }),
  "pnpm-lock.yaml": 2000,
  ".gitignore": "node_modules\n.env\n.env.*\n!.env.example\n",
  ".env.example": "API_URL=https://example.com\n",
  "README.md":
    "# Habit Tracker\n\nA habit tracker for students. Run `pnpm dev`, then open localhost:3000. Deploy with Vercel.\n" +
    "More documentation. ".repeat(10),
  ".github/workflows/ci.yml": "name: CI\non: push\n",
  "src/app/page.tsx": "export default function Home() { return <main>Your habits</main>; }\n",
  "src/lib/db.ts": "const url = process.env.DATABASE_URL;\nexport const db = connect(url);\n",
  "src/lib/habits.test.ts": "import { test } from 'vitest';\ntest('adds', () => {});\n",
});

const ABANDONED = snap({
  "package.json": JSON.stringify({
    name: "x",
    scripts: { dev: "next dev", test: 'echo "Error: no test specified" && exit 1' },
    dependencies: {
      next: "latest",
      react: "*",
      request: "^2.88.0",
      "@supabase/supabase-js": "^2.0.0",
    },
  }),
  ".env": 120,
  ".env.local": 90,
  "README.md":
    "This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).",
  "src/app/page.tsx":
    "export default function Home() {\n  return <p>Get started by editing src/app/page.tsx</p>;\n}\n",
  "src/lib/pay.ts": `// TODO: wire up checkout\nconst stripe = new Stripe("${FAKE_STRIPE}");\nexport function refund() { throw new Error("not implemented"); }\n`,
  "src/lib/aws.ts": `const key = "${FAKE_AWS}"; // FIXME move this\n`,
  "src/api/search.ts":
    "export async function find(q) { return db.query(`SELECT * FROM items WHERE name = '${q}'`); }\n",
  "src/ui/Box.tsx":
    "export const Box = () => <div dangerouslySetInnerHTML={{ __html: html }} />;\n",
  "src/lib/empty.ts": 0,
  "src/lib/api.ts":
    "export const BASE = 'http://localhost:4000/api';\ntry { run(); } catch (e) {}\n",
});

const ids = (r: ReturnType<typeof scanSnapshot>) => r.findings.map((f) => f.ruleId);

describe("scanSnapshot: healthy project", () => {
  const r = scanSnapshot(HEALTHY);
  it("detects the stack and reports no serious problems", () => {
    expect(r.profile.frameworks).toEqual(expect.arrayContaining(["Next.js", "React", "Vitest"]));
    expect(r.profile.packageManager).toBe("pnpm");
    expect(r.profile.analysisLevel).toBe("full");
    expect(r.findings.filter((f) => ["critical", "high"].includes(f.severity))).toEqual([]);
    expect(ids(r)).not.toContain("no-tests");
    expect(r.summary.headline).toMatch(/Next\.js/);
  });
  it("always states its limits", () => {
    expect(r.limits.join(" ")).toMatch(/no repository code was executed/i);
    expect(r.limits.join(" ")).toMatch(/Static warning/i);
  });
});

describe("scanSnapshot: abandoned AI-built project", () => {
  const r = scanSnapshot(ABANDONED);
  const byId = (id: string) => r.findings.find((f) => f.ruleId === id)!;

  it("finds verified structural problems with evidence", () => {
    for (const id of [
      "env-file-committed",
      "no-lockfile",
      "no-test-script",
      "no-build-script",
      "no-tests",
      "unpinned-dependencies",
      "deprecated-dependencies",
      "readme-is-template",
      "no-gitignore",
      "starter-template-unchanged",
      "empty-source-files",
    ])
      expect(byId(id), id).toBeDefined();
    expect(byId("env-file-committed")).toMatchObject({
      kind: "verified",
      severity: "critical",
      area: "blocker",
    });
    expect(
      byId("env-file-committed")
        .evidence.map((e) => e.path)
        .sort(),
    ).toEqual([".env", ".env.local"]);
    expect(byId("starter-template-unchanged").evidence[0]).toMatchObject({
      path: "src/app/page.tsx",
      line: 2,
    });
  });
  it("labels heuristic findings as static warnings, not verified", () => {
    for (const id of [
      "hardcoded-secret",
      "todo-markers",
      "incomplete-stubs",
      "sql-string-building",
      "dynamic-code-execution",
      "hardcoded-local-urls",
      "swallowed-errors",
    ])
      expect(byId(id), id).toMatchObject({ kind: "static_warning" });
  });
  it("labels unprovable advice as recommendations", () => {
    expect(byId("no-ci")).toMatchObject({ kind: "recommendation" });
  });
  it("detects secrets per file but never stores the secret value", () => {
    const secrets = r.findings.filter((f) => f.ruleId === "hardcoded-secret");
    expect(secrets.map((f) => f.fingerprint).sort()).toEqual([
      "hardcoded-secret:src/lib/aws.ts",
      "hardcoded-secret:src/lib/pay.ts",
    ]);
    const json = JSON.stringify(r);
    expect(json).not.toContain(FAKE_STRIPE);
    expect(json).not.toContain(FAKE_AWS);
    expect(json).not.toContain("Zq81LmN4pR7sT0uVwX2yAb3C");
    expect(secrets[0]!.evidence[0]!.snippet).toMatch(/redacted \d+ chars/);
  });
  it("orders tasks by severity then evidence strength, and is deterministic", () => {
    expect(r.tasks[0]!.severity).toBe("critical");
    const sev = ["critical", "high", "medium", "low", "info"];
    const order = r.tasks.map((t) => sev.indexOf(t.severity));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(r.tasks.map((t) => t.priority)).toEqual(r.tasks.map((_, i) => i + 1));
    expect(JSON.stringify(scanSnapshot(ABANDONED))).toBe(JSON.stringify(r));
    expect(new Set(r.findings.map((f) => f.fingerprint)).size).toBe(r.findings.length);
    expect(
      r.summary.byKind.verified + r.summary.byKind.static_warning + r.summary.byKind.recommendation,
    ).toBe(r.findings.length);
  });
  it("every finding has actionable remedy text", () => {
    for (const f of r.findings) expect(f.remedy.length, f.ruleId).toBeGreaterThan(15);
  });
});

describe("false-positive controls", () => {
  it("ignores placeholders and env lookups", () => {
    const r = scanSnapshot(
      snap({
        "package.json": JSON.stringify({
          scripts: { test: "vitest", build: "vite build" },
          dependencies: { vite: "^5" },
        }),
        "pnpm-lock.yaml": 10,
        "src/a.ts":
          'const k = process.env.STRIPE_KEY;\nconst apiKey = "your_api_key_here_please";\nconst token = "xxxxxxxxxxxxxxxxxxxxxxxx";\n',
      }),
    );
    expect(ids(r)).not.toContain("hardcoded-secret");
  });
  it("does not treat .env.example as a committed env file", () => {
    expect(ids(scanSnapshot(snap({ ".env.example": 10, "package.json": "{}" })))).not.toContain(
      "env-file-committed",
    );
  });
});

describe("truncation and unsupported stacks", () => {
  it("downgrades 'missing' claims to warnings when the tree is truncated", () => {
    const r = scanSnapshot(
      snap(
        {
          "package.json": JSON.stringify({ dependencies: { react: "^19" } }),
          "src/a.tsx": "export {}",
        },
        { truncated: true },
      ),
    );
    expect(r.findings.find((f) => f.ruleId === "no-lockfile")!.kind).toBe("static_warning");
    expect(r.findings.find((f) => f.ruleId === "no-tests")!.kind).toBe("static_warning");
    expect(r.limits.join(" ")).toMatch(/truncated/);
  });
  it("only runs structural checks on partially supported stacks", () => {
    const r = scanSnapshot(
      snap({ "pubspec.yaml": "name: app", "lib/main.dart": "void main() {} // TODO" }),
    );
    expect(r.profile).toMatchObject({ analysisLevel: "limited" });
    expect(r.profile.frameworks).toContain("Flutter/Dart");
    expect(ids(r)).not.toContain("todo-markers");
    expect(r.limits.join(" ")).toMatch(/partially supported/);
  });
  it("detects Python frameworks", () => {
    const r = scanSnapshot(
      snap({
        "requirements.txt": "fastapi==0.110\nuvicorn\n",
        "main.py": 'q = f"SELECT * FROM t WHERE id = {uid}"\n',
      }),
    );
    expect(r.profile.frameworks).toContain("FastAPI");
    expect(ids(r)).toContain("sql-string-building");
  });
  it("flags invalid package.json and Expo store identifiers", () => {
    expect(ids(scanSnapshot(snap({ "package.json": "{ not json" })))).toContain(
      "invalid-package-json",
    );
    const expo = scanSnapshot(
      snap({
        "package.json": JSON.stringify({ dependencies: { expo: "~58" } }),
        "app.json": JSON.stringify({ expo: { name: "x" } }),
      }),
    );
    expect(ids(expo)).toContain("expo-store-ids-missing");
  });
});

describe("selectFilesToFetch", () => {
  it("prioritises manifests, never fetches env files, lockfiles or vendored code, and respects caps", () => {
    const tree = [
      { path: ".env", size: 50 },
      { path: "pnpm-lock.yaml", size: 900 },
      { path: "node_modules/x/index.js", size: 10 },
      { path: "package.json", size: 300 },
      { path: "README.md", size: 200 },
      { path: "src/app/page.tsx", size: 400 },
      { path: "huge.ts", size: 9_999_999 },
      { path: "image.png", size: 100 },
      ...Array.from({ length: 200 }, (_, i) => ({ path: `src/m${i}.ts`, size: 100 })),
    ];
    const picked = selectFilesToFetch(tree);
    expect(picked.slice(0, 2).sort()).toEqual(["README.md", "package.json"]);
    for (const bad of [".env", "pnpm-lock.yaml", "node_modules/x/index.js", "huge.ts", "image.png"])
      expect(picked).not.toContain(bad);
    expect(picked).toContain("src/app/page.tsx");
    expect(picked.length).toBe(MAX_FETCH_FILES);
  });
});

describe("verification checks", () => {
  const rep = scanSnapshot(HEALTHY);
  it("static checks pass for a healthy project and never claim sandbox execution", () => {
    const checks = runStaticChecks(HEALTHY, rep.profile, rep.findings);
    for (const id of [
      "static.tests-present",
      "static.build-script",
      "static.lockfile",
      "static.no-committed-env",
      "static.no-secret-patterns",
    ])
      expect(checks.find((c) => c.id === id)?.status, id).toBe("pass");
    expect(checks.find((c) => c.id === "sandbox.tests")).toMatchObject({
      status: "unavailable",
      source: "sandbox",
    });
  });
  it("static checks fail for the abandoned project", () => {
    const r = scanSnapshot(ABANDONED);
    const checks = runStaticChecks(ABANDONED, r.profile, r.findings);
    for (const id of [
      "static.tests-present",
      "static.build-script",
      "static.lockfile",
      "static.no-committed-env",
      "static.no-secret-patterns",
    ])
      expect(checks.find((c) => c.id === id)?.status, id).toBe("fail");
  });
  it("CI evidence: pass, fail, pending, none and unreadable are distinct", () => {
    const ok = { name: "a", status: "completed", conclusion: "success" };
    expect(evaluateCiChecks([ok, { ...ok, name: "b", conclusion: "skipped" }], "abc").status).toBe(
      "pass",
    );
    expect(evaluateCiChecks([ok, { ...ok, name: "b", conclusion: "failure" }]).status).toBe("fail");
    expect(
      evaluateCiChecks([ok, { name: "c", status: "in_progress", conclusion: null }]).status,
    ).toBe("skipped");
    expect(evaluateCiChecks([]).status).toBe("unavailable");
    expect(evaluateCiChecks(null).status).toBe("unavailable");
    expect(
      evaluateCiChecks([{ name: "t", status: "completed", conclusion: "timed_out" }]).status,
    ).toBe("fail");
  });
});

describe("computeReadiness", () => {
  const base = {
    requiredMilestones: { done: 4, verified: 4, total: 4 },
    hasScan: true,
    latestVerification: "pass" as const,
  };
  it("is ready only when everything is verified and clean", () => {
    expect(
      computeReadiness({
        ...base,
        findings: [{ severity: "low", status: "open", resolutionSource: null }],
      }),
    ).toMatchObject({ ready: true, blockers: [] });
  });
  it("self-reported completion is not readiness", () => {
    const r = computeReadiness({
      ...base,
      requiredMilestones: { done: 4, verified: 2, total: 4 },
      findings: [],
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.join()).toMatch(/self-reported/);
  });
  it("dismissing a serious finding never makes a project ready", () => {
    const r = computeReadiness({
      ...base,
      findings: [{ severity: "critical", status: "dismissed", resolutionSource: "user" }],
    });
    expect(r.ready).toBe(false);
    expect(
      computeReadiness({
        ...base,
        findings: [{ severity: "critical", status: "resolved", resolutionSource: "rescan" }],
      }).ready,
    ).toBe(true);
  });
  it("a user's own 'resolved' claim is not evidence for a serious finding", () => {
    for (const severity of ["critical", "high"] as const)
      expect(
        computeReadiness({
          ...base,
          findings: [{ severity, status: "resolved", resolutionSource: "user" }],
        }).ready,
      ).toBe(false);
    // but a lower-severity claim does not block readiness
    expect(
      computeReadiness({
        ...base,
        findings: [{ severity: "medium", status: "resolved", resolutionSource: "user" }],
      }).ready,
    ).toBe(true);
  });
  it("a dismissed serious finding stops blocking once the latest scan no longer detects it", () => {
    const f = {
      severity: "critical" as const,
      status: "dismissed" as const,
      resolutionSource: null,
    };
    expect(computeReadiness({ ...base, findings: [{ ...f, present: true }] }).ready).toBe(false);
    expect(computeReadiness({ ...base, findings: [{ ...f, present: false }] }).ready).toBe(true);
  });
  it("requires a scan and a non-failing verification run", () => {
    expect(computeReadiness({ ...base, hasScan: false, findings: [] }).ready).toBe(false);
    expect(computeReadiness({ ...base, latestVerification: "fail", findings: [] }).ready).toBe(
      false,
    );
    expect(computeReadiness({ ...base, latestVerification: "none", findings: [] }).ready).toBe(
      false,
    );
  });
});
