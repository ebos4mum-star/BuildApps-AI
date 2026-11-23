import type { TreeEntry } from "./types";

export const MAX_FETCH_FILES = 80;
export const MAX_FILE_BYTES = 100_000;
export const MAX_TOTAL_BYTES = 2_000_000;

const MANIFESTS = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pubspec.yaml",
  "Gemfile",
  "composer.json",
  "app.json",
  "tsconfig.json",
  ".gitignore",
  "Dockerfile",
  "vercel.json",
  "netlify.toml",
  "eas.json",
  "capacitor.config.json",
]);
const CONFIG_PREFIXES = [
  "next.config.",
  "vite.config.",
  "app.config.",
  "nuxt.config.",
  "svelte.config.",
  "astro.config.",
  "vitest.config.",
  "jest.config.",
  "babel.config.",
];
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|rb|php|dart|vue|svelte)$/i;
const SKIP_DIRS =
  /(^|\/)(node_modules|dist|build|\.next|\.expo|coverage|vendor|__pycache__|\.git|\.venv|venv|Pods)\//;
const LOCK_FILES =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|Pipfile\.lock|Cargo\.lock|go\.sum)$/;
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const depth = (p: string) => p.split("/").length - 1;

export const isLockFile = (p: string) => LOCK_FILES.test(p);
export const isSourceFile = (p: string) =>
  SOURCE_EXT.test(p) && !SKIP_DIRS.test(p) && !/\.d\.ts$/.test(p);
export const isTestFile = (p: string) =>
  /(^|\/)(__tests__|tests?|e2e|spec)\//i.test(p) ||
  /\.(test|spec)\.[a-z]+$/i.test(p) ||
  /(^|\/)test_[^/]+\.py$/i.test(p) ||
  /_test\.(go|py)$/i.test(p);

function wanted(p: string): number {
  const b = base(p);
  if (SKIP_DIRS.test(p)) return 0;
  if (depth(p) <= 1 && (MANIFESTS.has(b) || CONFIG_PREFIXES.some((x) => b.startsWith(x))))
    return 100;
  if (/^readme(\.[a-z]+)?$/i.test(b) && depth(p) === 0) return 95;
  if (/^\.env(\..+)?$/.test(b)) return 0; // never fetch real env files: their presence alone is the finding
  if (p.startsWith(".github/workflows/")) return 60;
  if (isSourceFile(p)) {
    // entry points and shallow files first
    let s = 50 - depth(p) * 4;
    if (/(^|\/)(app|page|index|main|layout|_layout|App)\.[a-z]+$/.test(p)) s += 20;
    if (isTestFile(p)) s -= 15;
    return Math.max(s, 1);
  }
  return 0;
}

/** Picks a bounded, prioritised set of files to fetch. Pure: used before any network call. */
export function selectFilesToFetch(tree: readonly TreeEntry[]): string[] {
  const ranked = tree
    .filter((t) => t.size <= MAX_FILE_BYTES && wanted(t.path) > 0)
    .map((t) => ({ ...t, score: wanted(t.path) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const out: string[] = [];
  let bytes = 0;
  for (const f of ranked) {
    if (out.length >= MAX_FETCH_FILES || bytes + f.size > MAX_TOTAL_BYTES) continue;
    out.push(f.path);
    bytes += f.size;
  }
  return out;
}
