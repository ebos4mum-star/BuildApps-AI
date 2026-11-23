import { createSign } from "node:crypto";
import {
  selectFilesToFetch,
  type CheckRunInfo,
  type RepoSnapshot,
  type TreeEntry,
} from "@buildapps/scanner";
import {
  assertRepoRef,
  GitHubError,
  type GitHubGateway,
  type InstallationInfo,
  type RepoInfo,
} from "./types";

export interface AppConfig {
  appId: string;
  /** PEM private key. Server env only; never stored in the database or logged. */
  privateKey: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  /** Wall-clock budget for fetching file contents of one scan. */
  fetchBudgetMs?: number;
  now?: () => number;
}

const API = "https://api.github.com";
/** Least privilege: every installation token is limited to these permissions AND to the single repo scanned. */
export const TOKEN_PERMISSIONS = { contents: "read", metadata: "read", checks: "read" } as const;

export class GitHubAppGateway implements GitHubGateway {
  private readonly f: typeof fetch;
  private readonly now: () => number;
  constructor(private readonly cfg: AppConfig) {
    this.f = cfg.fetchImpl ?? fetch;
    this.now = cfg.now ?? Date.now;
  }

  /** Short-lived (<10 min) RS256 JWT identifying the App itself. */
  appJwt(): string {
    const t = Math.floor(this.now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const data = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: t - 60, exp: t + 540, iss: this.cfg.appId })}`;
    const sig = createSign("RSA-SHA256")
      .update(data)
      .sign(this.cfg.privateKey.replace(/\\n/g, "\n"))
      .toString("base64url");
    return `${data}.${sig}`;
  }

  private async req(
    path: string,
    init: RequestInit & { token: string; absolute?: boolean },
  ): Promise<Response> {
    const { token, absolute, ...rest } = init;
    return this.f(absolute ? path : `${API}${path}`, {
      ...rest,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        "User-Agent": "BuildApps-AI",
        ...(rest.headers ?? {}),
      },
    });
  }
  private async json<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) throw new GitHubError(res.status, `GitHub ${what} failed (${res.status})`);
    return (await res.json()) as T;
  }

  private async installationToken(installationId: number, repoName?: string): Promise<string> {
    const res = await this.req(`/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      token: this.appJwt(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permissions: TOKEN_PERMISSIONS,
        ...(repoName ? { repositories: [repoName] } : {}),
      }),
    });
    return (await this.json<{ token: string }>(res, "installation token")).token;
  }

  async getInstallation(installationId: number): Promise<InstallationInfo | null> {
    const res = await this.req(`/app/installations/${installationId}`, { token: this.appJwt() });
    if (res.status === 404) return null;
    return toInstallation(await this.json(res, "installation lookup"));
  }

  async userInstallations(code: string): Promise<InstallationInfo[]> {
    const tokenRes = await this.f("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "BuildApps-AI",
      },
      body: JSON.stringify({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        code,
      }),
    });
    const body = await this.json<{ access_token?: string }>(tokenRes, "OAuth exchange");
    if (!body.access_token)
      throw new GitHubError(401, "GitHub did not accept the authorization code");
    // The user token is used once to prove which installations this person can access, then dropped.
    const res = await this.req("/user/installations?per_page=100", { token: body.access_token });
    const j = await this.json<{ installations: unknown[] }>(res, "user installations");
    return j.installations.map(toInstallation);
  }

  async listRepos(installationId: number): Promise<RepoInfo[]> {
    const token = await this.installationToken(installationId);
    const out: RepoInfo[] = [];
    for (let page = 1; page <= 3; page++) {
      const j = await this.json<{ repositories: RawRepo[] }>(
        await this.req(`/installation/repositories?per_page=100&page=${page}`, { token }),
        "repository list",
      );
      out.push(...j.repositories.map(toRepo));
      if (j.repositories.length < 100) break;
    }
    return out;
  }

  async getSnapshot(installationId: number, owner: string, repo: string): Promise<RepoSnapshot> {
    assertRepoRef(owner, repo);
    const token = await this.installationToken(installationId, repo);
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const info = await this.json<{ default_branch: string }>(
      await this.req(base, { token }),
      "repository lookup",
    );
    const commit = await this.json<{ sha: string }>(
      await this.req(`${base}/commits/${encodeURIComponent(info.default_branch)}`, { token }),
      "commit lookup",
    );
    const tree = await this.json<{
      tree: { path: string; type: string; mode: string; sha: string; size?: number }[];
      truncated: boolean;
    }>(await this.req(`${base}/git/trees/${commit.sha}?recursive=1`, { token }), "tree listing");

    const blobs = tree.tree.filter((e) => e.type === "blob" && e.mode !== "120000"); // skip symlinks/submodules
    const entries: TreeEntry[] = blobs.map((b) => ({ path: b.path, size: b.size ?? 0 }));
    const shaByPath = new Map(blobs.map((b) => [b.path, b.sha]));
    const wanted = selectFilesToFetch(entries);

    const contents: Record<string, string> = {};
    const deadline = this.now() + (this.cfg.fetchBudgetMs ?? 20_000);
    let truncated = tree.truncated;
    let next = 0;
    const worker = async () => {
      while (next < wanted.length) {
        if (this.now() > deadline) {
          truncated = true;
          return;
        }
        const path = wanted[next++]!;
        const res = await this.req(`${base}/git/blobs/${shaByPath.get(path)}`, { token });
        if (!res.ok) {
          truncated = true;
          continue;
        }
        const b = (await res.json()) as { content: string; encoding: string };
        if (b.encoding !== "base64") continue;
        const buf = Buffer.from(b.content, "base64");
        if (buf.includes(0)) continue; // binary
        contents[path] = buf.toString("utf8");
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return { tree: entries, contents, truncated, commitSha: commit.sha, ref: info.default_branch };
  }

  async getCheckRuns(
    installationId: number,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<CheckRunInfo[] | null> {
    assertRepoRef(owner, repo);
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) return null;
    try {
      const token = await this.installationToken(installationId, repo);
      const res = await this.req(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}/check-runs?per_page=100`,
        { token },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as {
        check_runs: { name: string; status: string; conclusion: string | null }[];
      };
      return j.check_runs.map((r) => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
      }));
    } catch {
      return null;
    }
  }

  async uninstall(installationId: number): Promise<void> {
    const res = await this.req(`/app/installations/${installationId}`, {
      method: "DELETE",
      token: this.appJwt(),
    });
    if (res.status !== 204 && res.status !== 404)
      throw new GitHubError(res.status, `GitHub uninstall failed (${res.status})`);
  }

  installUrl(state: string): string {
    return `https://github.com/apps/${encodeURIComponent(this.cfg.slug)}/installations/new?state=${encodeURIComponent(state)}`;
  }
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}
const toRepo = (r: RawRepo): RepoInfo => ({
  id: r.id,
  owner: r.owner.login,
  name: r.name,
  fullName: r.full_name,
  private: r.private,
  defaultBranch: r.default_branch,
});
const toInstallation = (raw: unknown): InstallationInfo => {
  const r = raw as {
    id: number;
    account: { login: string; type: string };
    repository_selection: string;
  };
  return {
    installationId: r.id,
    accountLogin: r.account.login,
    accountType: r.account.type === "Organization" ? "Organization" : "User",
    repositorySelection: r.repository_selection === "all" ? "all" : "selected",
  };
};
