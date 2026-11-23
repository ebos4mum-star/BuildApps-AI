import type { CheckRunInfo, RepoSnapshot } from "@buildapps/scanner";
import {
  assertRepoRef,
  GitHubError,
  type GitHubGateway,
  type InstallationInfo,
  type RepoInfo,
} from "./types";

/** Builds a snapshot from path -> text (string) or size-only entries (number). */
export function toSnapshot(
  files: Record<string, string | number>,
  extra: Partial<RepoSnapshot> = {},
): RepoSnapshot {
  return {
    tree: Object.entries(files).map(([path, v]) => ({
      path,
      size: typeof v === "string" ? v.length : v,
    })),
    contents: Object.fromEntries(
      Object.entries(files).filter((e): e is [string, string] => typeof e[1] === "string"),
    ),
    truncated: false,
    ...extra,
  };
}

// Fake credentials are assembled at runtime so no scannable secret literal lives in the repo.
const FAKE_STRIPE = "sk_" + "live_" + "Zq81LmN4pR7sT0uVwX2yAb3C";

export const FIXTURE_HEALTHY: Record<string, string | number> = {
  "package.json": JSON.stringify({
    name: "healthy-app",
    scripts: { build: "next build", test: "vitest run" },
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { vitest: "^3.0.0" },
  }),
  "pnpm-lock.yaml": 2000,
  ".gitignore": "node_modules\n.env\n.env.*\n!.env.example\n",
  ".env.example": "API_URL=https://example.com\n",
  "README.md":
    "# Healthy app\n\nA small, finished habit tracker. Run `pnpm dev` and open localhost:3000. " +
    "Deployment notes. ".repeat(10),
  ".github/workflows/ci.yml": "name: CI\non: push\n",
  "src/app/page.tsx": "export default function Home() { return <main>Your habits</main>; }\n",
  "src/lib/habits.test.ts": "import { test } from 'vitest';\ntest('adds a habit', () => {});\n",
};

export const FIXTURE_STUCK: Record<string, string | number> = {
  "package.json": JSON.stringify({
    name: "stuck-app",
    scripts: { dev: "next dev", test: 'echo "Error: no test specified" && exit 1' },
    dependencies: { next: "latest", react: "*", "@supabase/supabase-js": "^2.0.0" },
  }),
  ".env": 120,
  "README.md":
    "This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).",
  "src/app/page.tsx":
    "export default function Home() {\n  return <p>Get started by editing src/app/page.tsx</p>;\n}\n",
  "src/lib/pay.ts": `// TODO: wire up checkout\nconst stripe = new Stripe("${FAKE_STRIPE}");\nexport function refund() { throw new Error("not implemented"); }\n`,
  "src/api/search.ts":
    "export async function find(q) { return db.query(`SELECT * FROM items WHERE name = '${q}'`); }\n",
};

export interface FakeRepo {
  info: RepoInfo;
  files: Record<string, string | number>;
  checks: CheckRunInfo[];
}

/**
 * In-memory GitHub used ONLY for local development and tests (selected by the same dev flag as the
 * memory backend). It serves fixture repositories and behaves like the real gateway's contract.
 */
export class FakeGitHubGateway implements GitHubGateway {
  readonly uninstalled = new Set<number>();
  /** Mutable so tests/dev can simulate a user fixing the repository between scans. */
  readonly repos: FakeRepo[];
  constructor(
    private readonly installation: InstallationInfo = {
      installationId: 1001,
      accountLogin: "demo",
      accountType: "User",
      repositorySelection: "selected",
    },
    repos?: FakeRepo[],
  ) {
    const ok: CheckRunInfo = { name: "CI", status: "completed", conclusion: "success" };
    this.repos = repos ?? [
      {
        info: {
          id: 1,
          owner: "demo",
          name: "healthy-app",
          fullName: "demo/healthy-app",
          private: false,
          defaultBranch: "main",
        },
        files: { ...FIXTURE_HEALTHY },
        checks: [ok],
      },
      {
        info: {
          id: 2,
          owner: "demo",
          name: "stuck-app",
          fullName: "demo/stuck-app",
          private: true,
          defaultBranch: "main",
        },
        files: { ...FIXTURE_STUCK },
        checks: [{ ...ok, conclusion: "failure" }],
      },
    ];
  }
  private live(id: number) {
    if (id !== this.installation.installationId || this.uninstalled.has(id))
      throw new GitHubError(404, "Installation not found");
  }
  private repo(owner: string, name: string): FakeRepo {
    assertRepoRef(owner, name);
    const r = this.repos.find((x) => x.info.owner === owner && x.info.name === name);
    if (!r) throw new GitHubError(404, "Repository not accessible to this installation");
    return r;
  }
  async userInstallations(code: string) {
    return code === "dev" && !this.uninstalled.has(this.installation.installationId)
      ? [this.installation]
      : [];
  }
  async getInstallation(id: number) {
    return id === this.installation.installationId && !this.uninstalled.has(id)
      ? this.installation
      : null;
  }
  async listRepos(id: number) {
    this.live(id);
    return this.repos.map((r) => r.info);
  }
  async getSnapshot(id: number, owner: string, repo: string) {
    this.live(id);
    const r = this.repo(owner, repo);
    return toSnapshot(r.files, { commitSha: "a".repeat(40), ref: r.info.defaultBranch });
  }
  async getCheckRuns(id: number, owner: string, repo: string) {
    this.live(id);
    return this.repo(owner, repo).checks;
  }
  async uninstall(id: number) {
    this.uninstalled.add(id);
  }
  installUrl(state: string) {
    return `/api/github/callback?installation_id=${this.installation.installationId}&code=dev&state=${encodeURIComponent(state)}`;
  }
}
