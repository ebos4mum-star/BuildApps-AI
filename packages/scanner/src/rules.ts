import { isLockFile, isSourceFile, isTestFile } from "./files";
import { parsePackageJson } from "./profile";
import type {
  Area,
  Category,
  Evidence,
  Finding,
  FindingKind,
  ProjectProfile,
  RepoSnapshot,
  Severity,
} from "./types";

interface Ctx {
  snap: RepoSnapshot;
  profile: ProjectProfile;
  paths: string[];
  has: (re: RegExp) => boolean;
  text: (path: string) => string | undefined;
  /** Fetched source files (never tests/docs/config) as [path, text]. */
  source: [string, string][];
  testSource: [string, string][];
  /** Absence claims are only "verified" when we saw the whole tree. */
  absent: FindingKind;
}

interface Draft {
  ruleId: string;
  key?: string;
  kind: FindingKind;
  category: Category;
  severity: Severity;
  area: Area;
  title: string;
  detail: string;
  remedy: string;
  evidence?: Evidence[];
}
const make = (d: Draft): Finding => ({
  ruleId: d.ruleId,
  fingerprint: d.key ? `${d.ruleId}:${d.key}` : d.ruleId,
  kind: d.kind,
  category: d.category,
  severity: d.severity,
  area: d.area,
  title: d.title,
  detail: d.detail,
  remedy: d.remedy,
  evidence: d.evidence ?? [],
});

/** Secrets are never stored: keep a 4-char prefix and the length only. */
export const redact = (secret: string) =>
  `${secret.slice(0, 4)}...[redacted ${secret.length} chars]`;

function* lines(text: string, max = 6000): Generator<[number, string]> {
  const arr = text.split("\n");
  for (let i = 0; i < Math.min(arr.length, max); i++) yield [i + 1, arr[i]!];
}

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { name: "Stripe live key", re: /\b(sk|rk)_live_[0-9A-Za-z]{16,}\b/ },
  { name: "Anthropic/OpenAI-style API key", re: /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "private key block", re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  {
    name: "hardcoded credential",
    re: /\b(api[_-]?key|secret|passw(or)?d|token)\b["']?\s*[:=]\s*["']([A-Za-z0-9/+_\-.=]{16,})["']/i,
  },
];
const PLACEHOLDER =
  /(example|placeholder|your[_-]|xxx|changeme|dummy|fake|sample|process\.env|import\.meta\.env|<[^>]+>|\$\{)/i;

/** Every snippet that leaves this module goes through here: any credential-looking text is redacted. */
const clip = (line: string, n = 140): string => {
  let t = line.trim();
  for (const { re } of SECRET_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    t = t.replace(g, (...m) => {
      const groups = m.slice(1, -2).filter((x): x is string => typeof x === "string");
      const secret = (groups.length > 0 ? groups[groups.length - 1] : m[0]) as string;
      return PLACEHOLDER.test(m[0]) ? m[0] : m[0].replace(secret, redact(secret));
    });
  }
  return t.length > n ? t.slice(0, n) + "..." : t;
};

const STARTER_MARKERS = [
  "Get started by editing",
  "Edit <code>src/App",
  "Open up App.js to start working",
  "Open up App.tsx to start working",
  "Open up the code for this screen",
  "Vite + React",
  "Welcome to Expo",
];
const DEPRECATED: Record<string, string> = {
  request: "deprecated since 2020",
  "node-sass": "deprecated; use sass",
  tslint: "deprecated; use ESLint",
  protractor: "end-of-life",
  "@babel/polyfill": "deprecated; use core-js",
  "babel-eslint": "deprecated; use @babel/eslint-parser",
  "node-uuid": "deprecated; use uuid",
  "gulp-util": "deprecated",
};
const NEEDS_BUILD = ["Next.js", "Vite", "Astro", "Gatsby", "Nuxt", "SvelteKit", "Angular", "Remix"];
const ENV_FILE = /(^|\/)\.env(\.(local|production|development|prod|staging|test))?$/;
const KEY_FILE = /(\.(pem|p12|pfx|jks|keystore)$|(^|\/)id_(rsa|ed25519|ecdsa)$)/;

type Rule = (c: Ctx) => Finding[];

const structural: Rule[] = [
  (c) => {
    const envs = c.paths.filter((p) => ENV_FILE.test(p));
    return envs.length === 0
      ? []
      : [
          make({
            ruleId: "env-file-committed",
            kind: "verified",
            category: "security",
            severity: "critical",
            area: "blocker",
            title: "Environment file committed to the repository",
            detail: `${envs.length} environment file(s) are tracked in Git. Anything in them is exposed to everyone with repository access and remains in history even if deleted. (Contents were not read.)`,
            remedy:
              "Remove the file from Git, add it to .gitignore, rotate every secret it contained, and commit a .env.example with placeholder values.",
            evidence: envs.slice(0, 5).map((path) => ({ path })),
          }),
        ];
  },
  (c) => {
    const keys = c.paths.filter((p) => KEY_FILE.test(p));
    return keys.length === 0
      ? []
      : [
          make({
            ruleId: "credential-file-committed",
            kind: "verified",
            category: "security",
            severity: "critical",
            area: "blocker",
            title: "Private key or keystore file committed",
            detail:
              "Key/certificate/keystore files are tracked in Git. Treat the credentials as compromised.",
            remedy:
              "Remove from the repository and its history, generate new credentials, and store signing keys in a secrets manager.",
            evidence: keys.slice(0, 5).map((path) => ({ path })),
          }),
        ];
  },
  (c) => {
    const nm = c.paths.filter((p) => p.startsWith("node_modules/"));
    return nm.length === 0
      ? []
      : [
          make({
            ruleId: "dependencies-committed",
            kind: "verified",
            category: "structure",
            severity: "medium",
            area: "hygiene",
            title: "node_modules is committed",
            detail:
              "Installed dependencies are tracked in Git, bloating the repository and hiding real changes.",
            remedy: "git rm -r --cached node_modules and add it to .gitignore.",
            evidence: [{ path: "node_modules/" }],
          }),
        ];
  },
  (c) =>
    c.has(/(^|\/)(dist|\.next|build)\//) && c.profile.dependencies.length > 0
      ? [
          make({
            ruleId: "build-artifacts-committed",
            kind: "verified",
            category: "structure",
            severity: "low",
            area: "hygiene",
            title: "Build output appears to be committed",
            detail: "Directories such as dist/, build/ or .next/ are tracked.",
            remedy: "Add build output directories to .gitignore and remove them from Git.",
            evidence: c.paths
              .filter((p) => /^(dist|\.next|build)\//.test(p))
              .slice(0, 3)
              .map((path) => ({ path })),
          }),
        ]
      : [],
  (c) =>
    !c.has(/^\.gitignore$/)
      ? [
          make({
            ruleId: "no-gitignore",
            kind: c.absent,
            category: "structure",
            severity: "medium",
            area: "hygiene",
            title: "No .gitignore",
            detail:
              "Without a .gitignore, secrets, dependencies and build output are easy to commit by accident.",
            remedy: "Add a .gitignore for your stack (node_modules, .env*, build output).",
          }),
        ]
      : [],
  (c) => {
    const gi = c.text(".gitignore");
    if (gi === undefined) return [];
    const out: Finding[] = [];
    if (!/^\s*\.env/m.test(gi) && !/^\s*\*\.env/m.test(gi))
      out.push(
        make({
          ruleId: "gitignore-missing-env",
          kind: "verified",
          category: "security",
          severity: "medium",
          area: "blocker",
          title: ".gitignore does not exclude .env files",
          detail: "A future `git add .` could commit secrets.",
          remedy: "Add `.env` and `.env.*` (with `!.env.example`) to .gitignore.",
          evidence: [{ path: ".gitignore" }],
        }),
      );
    if (c.profile.dependencies.length > 0 && !/node_modules/.test(gi))
      out.push(
        make({
          ruleId: "gitignore-missing-node-modules",
          kind: "verified",
          category: "structure",
          severity: "low",
          area: "hygiene",
          title: ".gitignore does not exclude node_modules",
          detail: "Dependencies may be committed.",
          remedy: "Add node_modules/ to .gitignore.",
          evidence: [{ path: ".gitignore" }],
        }),
      );
    return out;
  },
  (c) => {
    const readme = c.paths.find((p) => /^readme(\.[a-z]+)?$/i.test(p));
    if (!readme)
      return [
        make({
          ruleId: "no-readme",
          kind: c.absent,
          category: "docs",
          severity: "low",
          area: "hygiene",
          title: "No README",
          detail: "New contributors (and you, later) have no starting point.",
          remedy: "Add a README explaining what the project is and how to run it.",
        }),
      ];
    const t = c.text(readme);
    if (t === undefined) return [];
    if (
      /bootstrapped with \[?`?create-next-app|This template provides a minimal setup to get React working in Vite|Learn more about the template/i.test(
        t,
      ) ||
      t.trim().length < 120
    )
      return [
        make({
          ruleId: "readme-is-template",
          kind: "verified",
          category: "docs",
          severity: "low",
          area: "hygiene",
          title: "README is still the starter template or nearly empty",
          detail: "It does not describe this project.",
          remedy: "Replace it with what the app does, how to run it, and how to deploy it.",
          evidence: [{ path: readme }],
        }),
      ];
    return [];
  },
  (c) =>
    !c.has(
      /^\.github\/workflows\/|^\.gitlab-ci\.yml$|^\.circleci\/|^azure-pipelines\.yml$|^bitbucket-pipelines\.yml$/,
    ) && c.profile.analysisLevel === "full"
      ? [
          make({
            ruleId: "no-ci",
            kind: "recommendation",
            category: "build",
            severity: "low",
            area: "tests",
            title: "No continuous integration configured",
            detail:
              "No CI config was found. (Unverified advice: CI is not required, but it is how 'it works' becomes provable.)",
            remedy:
              "Add a CI workflow that runs install, lint, type-check and tests on every push.",
          }),
        ]
      : [],
  (c) => {
    const usesEnv = c.source.some(([, t]) =>
      /process\.env\.|import\.meta\.env\.|os\.environ|os\.getenv/.test(t),
    );
    return usesEnv && !c.has(/(^|\/)\.env\.(example|sample|template)$/)
      ? [
          make({
            ruleId: "no-env-example",
            kind: "recommendation",
            category: "docs",
            severity: "low",
            area: "hygiene",
            title: "Environment variables used but not documented",
            detail:
              "Source reads environment variables, but no .env.example exists. (Unverified advice.)",
            remedy: "Add .env.example listing every variable with placeholder values.",
          }),
        ]
      : [];
  },
  (c) => {
    const empty = c.snap.tree.filter((t) => t.size === 0 && isSourceFile(t.path));
    return empty.length === 0
      ? []
      : [
          make({
            ruleId: "empty-source-files",
            kind: "verified",
            category: "completeness",
            severity: "low",
            area: "completeness",
            title: `${empty.length} empty source file(s)`,
            detail: "Zero-byte source files usually mark unfinished features.",
            remedy: "Implement or delete them.",
            evidence: empty.slice(0, 6).map((t) => ({ path: t.path })),
          }),
        ];
  },
];

const nodeProject: Rule[] = [
  (c) => {
    const raw = c.text("package.json");
    if (raw === undefined) {
      const hasJs = c.paths.some((p) => isSourceFile(p) && /\.(tsx?|jsx?|mjs)$/.test(p));
      return hasJs &&
        !c.has(/^(deno\.jsonc?|bun\.lockb?)$/) &&
        c.snap.contents["package.json"] === undefined &&
        !c.has(/(^|\/)package\.json$/)
        ? [
            make({
              ruleId: "missing-package-json",
              kind: c.absent,
              category: "dependencies",
              severity: "high",
              area: "build",
              title: "JavaScript/TypeScript sources but no package.json",
              detail:
                "Dependencies and scripts are unknown, so the project cannot be installed or built reliably.",
              remedy:
                "Recreate package.json (npm init) and list the dependencies the code imports.",
            }),
          ]
        : [];
    }
    const p = parsePackageJson(raw);
    if (!p.ok)
      return [
        make({
          ruleId: "invalid-package-json",
          kind: "verified",
          category: "build",
          severity: "high",
          area: "blocker",
          title: "package.json is not valid JSON",
          detail: "Installs and builds will fail immediately.",
          remedy: "Fix the JSON syntax (trailing commas, merge-conflict markers).",
          evidence: [{ path: "package.json" }],
        }),
      ];
    const out: Finding[] = [];
    const { scripts, dependencies: deps } = c.profile;
    const testScript = scripts.test;
    if (!testScript || /no test specified/i.test(testScript))
      out.push(
        make({
          ruleId: "no-test-script",
          kind: "verified",
          category: "tests",
          severity: "medium",
          area: "tests",
          title: "No working test script",
          detail:
            "package.json defines no real `test` script, so tests cannot be run with a standard command.",
          remedy: "Add a test runner (e.g. Vitest/Jest) and a `test` script.",
          evidence: [{ path: "package.json" }],
        }),
      );
    if (!scripts.build && c.profile.frameworks.some((f) => NEEDS_BUILD.includes(f)))
      out.push(
        make({
          ruleId: "no-build-script",
          kind: "verified",
          category: "build",
          severity: "medium",
          area: "build",
          title: "No build script",
          detail: `This ${c.profile.frameworks.find((f) => NEEDS_BUILD.includes(f))} project has no \`build\` script.`,
          remedy: "Add the framework's build command as a `build` script.",
          evidence: [{ path: "package.json" }],
        }),
      );
    if (deps.length > 0 && !c.paths.some(isLockFile))
      out.push(
        make({
          ruleId: "no-lockfile",
          kind: c.absent,
          category: "dependencies",
          severity: "medium",
          area: "build",
          title: "No dependency lockfile",
          detail:
            "Without a lockfile every install can resolve different versions, which is a common cause of 'it worked yesterday'.",
          remedy: "Run your package manager's install and commit the lockfile.",
        }),
      );
    const locks = c.paths.filter((p) =>
      /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(p),
    );
    if (locks.length > 1)
      out.push(
        make({
          ruleId: "multiple-lockfiles",
          kind: "verified",
          category: "dependencies",
          severity: "low",
          area: "hygiene",
          title: "Multiple package-manager lockfiles",
          detail: "Different tools will resolve different versions.",
          remedy: "Choose one package manager and delete the other lockfiles.",
          evidence: locks.map((path) => ({ path })),
        }),
      );
    const unpinned = deps.filter(
      (d) =>
        ["*", "latest", "", "x"].includes(d.version.trim()) ||
        /^(git|github:|https?:)/.test(d.version),
    );
    if (unpinned.length > 0)
      out.push(
        make({
          ruleId: "unpinned-dependencies",
          kind: "verified",
          category: "dependencies",
          severity: "low",
          area: "build",
          title: `${unpinned.length} dependency version(s) not pinned`,
          detail: `Versions like "latest" or "*" change without warning: ${unpinned
            .slice(0, 5)
            .map((d) => d.name)
            .join(", ")}.`,
          remedy: "Pin to a semver range (e.g. ^1.2.3) and rely on the lockfile.",
          evidence: [{ path: "package.json" }],
        }),
      );
    const dep = deps.filter((d) => DEPRECATED[d.name]);
    if (dep.length > 0)
      out.push(
        make({
          ruleId: "deprecated-dependencies",
          kind: "verified",
          category: "dependencies",
          severity: "low",
          area: "hygiene",
          title: `${dep.length} deprecated dependenc${dep.length === 1 ? "y" : "ies"}`,
          detail: dep.map((d) => `${d.name} (${DEPRECATED[d.name]})`).join("; "),
          remedy: "Replace with the maintained alternative.",
          evidence: [{ path: "package.json" }],
        }),
      );
    return out;
  },
  (c) => {
    if (!c.profile.frameworks.includes("Expo")) return [];
    const j = c.text("app.json");
    if (j === undefined) return [];
    try {
      const e = (
        JSON.parse(j) as {
          expo?: { ios?: { bundleIdentifier?: string }; android?: { package?: string } };
        }
      ).expo;
      const missing = [
        !e?.ios?.bundleIdentifier && "ios.bundleIdentifier",
        !e?.android?.package && "android.package",
      ].filter(Boolean);
      return missing.length === 0
        ? []
        : [
            make({
              ruleId: "expo-store-ids-missing",
              kind: "verified",
              category: "build",
              severity: "low",
              area: "hygiene",
              title: "App store identifiers not set",
              detail: `app.json is missing ${missing.join(" and ")}, which are required to build and publish to the App Store / Google Play.`,
              remedy: "Choose permanent bundle/package identifiers and set them in app.json.",
              evidence: [{ path: "app.json" }],
            }),
          ];
    } catch {
      return [];
    }
  },
  (c) => {
    const hasTests = c.paths.some(isTestFile);
    if (hasTests || c.profile.analysisLevel !== "full") return [];
    return [
      make({
        ruleId: "no-tests",
        kind: c.absent,
        category: "tests",
        severity: "medium",
        area: "tests",
        title: "No test files found",
        detail:
          "No *.test.*, *.spec.*, __tests__/ or tests/ files exist, so nothing proves the app works.",
        remedy: "Start with a few tests for the core flows (sign-in, save, the main screen).",
      }),
    ];
  },
];

const content: Rule[] = [
  (c) => {
    const byFile = new Map<string, Evidence[]>();
    for (const [path, text] of [
      ...c.source,
      ...c.testSource,
      ...Object.entries(c.snap.contents).filter(
        ([p]) =>
          /(^|\/)(\.env\.example|[^/]*\.(json|ya?ml|toml|env|ini|properties))$/.test(p) &&
          !/lock|package\.json|tsconfig/.test(p),
      ),
    ]) {
      if (/\.example$/.test(path)) continue;
      for (const [n, line] of lines(text)) {
        for (const { name, re } of SECRET_PATTERNS) {
          const m = re.exec(line);
          if (!m) continue;
          const val = m[3] ?? m[0];
          if (PLACEHOLDER.test(line) || PLACEHOLDER.test(val)) continue;
          (byFile.get(path) ?? byFile.set(path, []).get(path)!).push({
            path,
            line: n,
            snippet: `${name}: ${redact(val)}`,
          });
          break;
        }
      }
    }
    return [...byFile].map(([path, ev]) =>
      make({
        ruleId: "hardcoded-secret",
        key: path,
        kind: "static_warning",
        category: "security",
        severity: "critical",
        area: "blocker",
        title: `Possible hardcoded secret in ${path}`,
        detail: `${ev.length} line(s) match a credential pattern. This is a pattern match and may be a false positive, but treat it as exposed until checked. Values are redacted in this report.`,
        remedy:
          "Move the value to an environment variable, rotate it if it is real, and purge it from Git history.",
        evidence: ev.slice(0, 3),
      }),
    );
  },
  (c) => {
    const hits: Evidence[] = [];
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "todo-markers",
            kind: "static_warning",
            category: "completeness",
            severity: hits.length >= 10 ? "medium" : "low",
            area: "completeness",
            title: `${hits.length} TODO/FIXME marker(s) in source`,
            detail:
              "Markers left by you or an AI tool often point at unfinished or knowingly-broken code.",
            remedy: "Triage each marker: finish it, delete it, or turn it into a tracked task.",
            evidence: hits.slice(0, 6),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    const re =
      /throw new Error\(\s*['"`](not implemented|todo|unimplemented|coming soon)|raise NotImplementedError|lorem ipsum|return null;?\s*\/\/\s*(placeholder|todo)/i;
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (re.test(l)) hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "incomplete-stubs",
            kind: "static_warning",
            category: "completeness",
            severity: "medium",
            area: "completeness",
            title: `${hits.length} unimplemented stub(s) or placeholder(s)`,
            detail:
              "Code that throws 'not implemented' or shows placeholder text means a feature exists on screen but not in behaviour.",
            remedy: "Implement each stub or remove the entry point that reaches it.",
            evidence: hits.slice(0, 6),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (STARTER_MARKERS.some((m) => l.includes(m)))
          hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "starter-template-unchanged",
            kind: "verified",
            category: "completeness",
            severity: "medium",
            area: "completeness",
            title: "Starter template screen still present",
            detail:
              "A screen still shows the framework's default content, so the real product UI has not replaced it.",
            remedy: "Replace the default screen with your actual home page.",
            evidence: hits.slice(0, 3),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    const patterns = [
      /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{/i, // JS template literal interpolation
      /["'][^"']*\b(select|insert|update|delete)\b[^"']*["']\s*\+/i, // "SELECT ... " + value
      /\bf["'][^"']*\b(select|insert|update|delete)\b[^"']*\{/i, // Python f-string
    ];
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (patterns.some((re) => re.test(l))) hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "sql-string-building",
            kind: "static_warning",
            category: "security",
            severity: "high",
            area: "blocker",
            title: "SQL built from strings",
            detail:
              "Queries assembled with string concatenation/interpolation can allow SQL injection if any part comes from a user.",
            remedy: "Use parameterised queries (placeholders) or your ORM's query builder.",
            evidence: hits.slice(0, 4),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    const re =
      /\beval\s*\(|new Function\s*\(|dangerouslySetInnerHTML|\bos\.system\s*\(|shell\s*=\s*True|\bexec\s*\(\s*f?["']/;
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (re.test(l) && !/^\s*(\/\/|#|\*)/.test(l))
          hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "dynamic-code-execution",
            kind: "static_warning",
            category: "security",
            severity: "medium",
            area: "hygiene",
            title: "Dynamic code execution or unescaped HTML",
            detail:
              "eval, new Function, shell=True or dangerouslySetInnerHTML are dangerous if fed by user input.",
            remedy:
              "Replace with safe alternatives or make sure the input can never be user-controlled.",
            evidence: hits.slice(0, 4),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    for (const [path, text] of c.testSource)
      for (const [n, l] of lines(text))
        if (
          /\b(it|test|describe)\.skip\(|\bx(it|describe)\(|@pytest\.mark\.skip|@unittest\.skip/.test(
            l,
          )
        )
          hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "skipped-tests",
            kind: "static_warning",
            category: "tests",
            severity: "low",
            area: "tests",
            title: `${hits.length} skipped test(s)`,
            detail: "Skipped tests are failures that were silenced.",
            remedy: "Fix or delete each skipped test.",
            evidence: hits.slice(0, 5),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (/https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(l))
          hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "hardcoded-local-urls",
            kind: "static_warning",
            category: "completeness",
            severity: "low",
            area: "build",
            title: "Hardcoded localhost URLs",
            detail: "URLs pointing at the developer's machine will not work once deployed.",
            remedy: "Read base URLs from environment configuration.",
            evidence: hits.slice(0, 4),
          }),
        ];
  },
  (c) => {
    const hits: Evidence[] = [];
    for (const [path, text] of c.source)
      for (const [n, l] of lines(text))
        if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(l) || /^\s*except[^:]*:\s*pass\s*$/.test(l))
          hits.push({ path, line: n, snippet: clip(l) });
    return hits.length === 0
      ? []
      : [
          make({
            ruleId: "swallowed-errors",
            kind: "static_warning",
            category: "completeness",
            severity: "low",
            area: "completeness",
            title: `${hits.length} empty catch block(s)`,
            detail: "Errors are caught and ignored, which hides the real cause of bugs.",
            remedy: "Log or handle the error, or let it propagate.",
            evidence: hits.slice(0, 4),
          }),
        ];
  },
];

export function runRules(snap: RepoSnapshot, profile: ProjectProfile): Finding[] {
  const paths = snap.tree.map((t) => t.path);
  const entries = Object.entries(snap.contents);
  const ctx: Ctx = {
    snap,
    profile,
    paths,
    has: (re) => paths.some((p) => re.test(p)),
    text: (p) => snap.contents[p],
    source: entries.filter(([p]) => isSourceFile(p) && !isTestFile(p)),
    testSource: entries.filter(([p]) => isSourceFile(p) && isTestFile(p)),
    absent: snap.truncated ? "static_warning" : "verified",
  };
  const rules = [
    ...structural,
    ...(profile.analysisLevel === "full"
      ? [...nodeProject, ...content]
      : profile.analysisLevel === "limited"
        ? []
        : []),
  ];
  const seen = new Set<string>();
  return rules
    .flatMap((r) => r(ctx))
    .filter((f) => (seen.has(f.fingerprint) ? false : (seen.add(f.fingerprint), true)));
}
