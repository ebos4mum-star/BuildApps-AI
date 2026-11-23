import type { CheckRunInfo, RepoSnapshot } from "@buildapps/scanner";

export interface InstallationInfo {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
}
export interface RepoInfo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/**
 * Everything BuildApps needs from GitHub. All operations are READ-ONLY except `uninstall`, which
 * removes our own App from the user's account (that is how access is revoked).
 */
export interface GitHubGateway {
  /** Verifies the OAuth code from the install redirect and returns installations THAT USER can access. */
  userInstallations(code: string): Promise<InstallationInfo[]>;
  getInstallation(installationId: number): Promise<InstallationInfo | null>;
  listRepos(installationId: number): Promise<RepoInfo[]>;
  /** Fetches a bounded snapshot (tree + selected text files). Never clones or executes anything. */
  getSnapshot(installationId: number, owner: string, repo: string): Promise<RepoSnapshot>;
  /** CI results for a commit, or null if unreadable (permission/API error). */
  getCheckRuns(
    installationId: number,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<CheckRunInfo[] | null>;
  /** Removes the GitHub App installation (revokes all access). Idempotent. */
  uninstall(installationId: number): Promise<void>;
  /** URL the user visits to install/authorize the App. */
  installUrl(state: string): string;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
export function assertRepoRef(owner: string, repo: string): void {
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..")
    throw new GitHubError(400, "Invalid repository reference");
}
