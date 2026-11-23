import { isLockFile, isSourceFile } from "./files";
import type { DependencyInfo, ProjectProfile, RepoSnapshot } from "./types";

const FRAMEWORK_DEPS: [string, string][] = [
  ["next", "Next.js"],
  ["expo", "Expo"],
  ["react-native", "React Native"],
  ["react", "React"],
  ["vite", "Vite"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["@sveltejs/kit", "SvelteKit"],
  ["svelte", "Svelte"],
  ["nuxt", "Nuxt"],
  ["vue", "Vue"],
  ["astro", "Astro"],
  ["@remix-run/react", "Remix"],
  ["gatsby", "Gatsby"],
  ["@angular/core", "Angular"],
  ["electron", "Electron"],
  ["@supabase/supabase-js", "Supabase"],
  ["firebase", "Firebase"],
  ["prisma", "Prisma"],
  ["@prisma/client", "Prisma"],
  ["drizzle-orm", "Drizzle"],
  ["mongoose", "MongoDB (Mongoose)"],
  ["stripe", "Stripe"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
];
const PY_FRAMEWORKS: [RegExp, string][] = [
  [/^django\b/im, "Django"],
  [/^flask\b/im, "Flask"],
  [/^fastapi\b/im, "FastAPI"],
];

export function parsePackageJson(text: string | undefined): {
  deps: DependencyInfo[];
  scripts: Record<string, string>;
  ok: boolean;
} {
  if (!text) return { deps: [], scripts: {}, ok: false };
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const obj = (k: string) =>
      j[k] && typeof j[k] === "object" ? (j[k] as Record<string, unknown>) : {};
    const deps: DependencyInfo[] = [
      ...Object.entries(obj("dependencies")).map(([name, v]) => ({
        name,
        version: String(v),
        dev: false,
      })),
      ...Object.entries(obj("devDependencies")).map(([name, v]) => ({
        name,
        version: String(v),
        dev: true,
      })),
    ];
    const scripts = Object.fromEntries(
      Object.entries(obj("scripts")).map(([k, v]) => [k, String(v)]),
    );
    return { deps, scripts, ok: true };
  } catch {
    return { deps: [], scripts: {}, ok: false };
  }
}

export function buildProfile(snap: RepoSnapshot): ProjectProfile {
  const paths = snap.tree.map((t) => t.path);
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const pkg = parsePackageJson(snap.contents["package.json"]);
  const frameworks = new Set<string>();
  for (const [dep, name] of FRAMEWORK_DEPS)
    if (pkg.deps.some((d) => d.name === dep)) frameworks.add(name);

  const py =
    (snap.contents["requirements.txt"] ?? "") + "\n" + (snap.contents["pyproject.toml"] ?? "");
  for (const [re, name] of PY_FRAMEWORKS)
    if (re.test(py) || new RegExp(`["']${name.toLowerCase()}`, "i").test(py)) frameworks.add(name);
  if (has(/^go\.mod$/)) frameworks.add("Go modules");
  if (has(/^Cargo\.toml$/)) frameworks.add("Rust (Cargo)");
  if (has(/^pubspec\.yaml$/)) frameworks.add("Flutter/Dart");
  if (has(/^Gemfile$/)) frameworks.add("Ruby");
  if (has(/^composer\.json$/)) frameworks.add("PHP (Composer)");
  if (has(/\.xcodeproj\//) || has(/^Package\.swift$/)) frameworks.add("Native iOS");
  if (has(/(^|\/)build\.gradle(\.kts)?$/)) frameworks.add("Native Android/Gradle");

  const languages = new Set<string>();
  if (has(/\.tsx?$/)) languages.add("TypeScript");
  if (has(/\.(jsx?|mjs|cjs)$/)) languages.add("JavaScript");
  if (has(/\.py$/)) languages.add("Python");
  for (const [ext, lang] of [
    ["go", "Go"],
    ["rs", "Rust"],
    ["rb", "Ruby"],
    ["php", "PHP"],
    ["dart", "Dart"],
    ["swift", "Swift"],
    ["kt", "Kotlin"],
    ["java", "Java"],
  ] as const)
    if (has(new RegExp(`\\.${ext}$`))) languages.add(lang);

  let packageManager: ProjectProfile["packageManager"] = null;
  if (has(/(^|\/)pnpm-lock\.yaml$/)) packageManager = "pnpm";
  else if (has(/(^|\/)yarn\.lock$/)) packageManager = "yarn";
  else if (has(/(^|\/)bun\.lockb?$/)) packageManager = "bun";
  else if (has(/(^|\/)package-lock\.json$/) || pkg.ok) packageManager = "npm";
  else if (has(/^requirements\.txt$|^pyproject\.toml$|^Pipfile$/)) packageManager = "pip";

  const jsOrPy =
    pkg.ok ||
    has(/^package\.json$/) ||
    languages.has("TypeScript") ||
    languages.has("JavaScript") ||
    languages.has("Python");
  return {
    frameworks: [...frameworks],
    languages: [...languages],
    packageManager,
    analysisLevel: jsOrPy ? "full" : frameworks.size > 0 || languages.size > 0 ? "limited" : "none",
    dependencies: pkg.deps,
    scripts: pkg.scripts,
    stats: {
      files: paths.length,
      contentFilesScanned: Object.keys(snap.contents).length,
      truncated: snap.truncated,
    },
  };
}

export { isLockFile, isSourceFile };
