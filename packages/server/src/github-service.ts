import { signState, verifyState, GitHubError, type RepoInfo } from "@buildapps/github";
import { parseGitHubRepo } from "@buildapps/core";
import { nowOf, type Deps } from "./deps";
import { WorkspaceError } from "./errors";
import type { InstallationRow } from "./batch2-types";

function gateway(d: Deps) {
  if (!d.gateway)
    throw new WorkspaceError("unavailable", "GitHub integration is not configured on this server");
  return d.gateway;
}

/** Step 1: the signed state ties the GitHub install flow to the BuildApps user who started it. */
export function startGithubConnect(d: Deps, userId: string): { url: string } {
  return { url: gateway(d).installUrl(signState(userId, d.stateSecret, nowOf(d).getTime())) };
}

/**
 * Step 2 (browser redirect from GitHub; no bearer token is present, so the signed state IS the
 * authentication). The OAuth `code` proves the GitHub user really has access to the installation,
 * so nobody can attach an installation they do not control.
 */
export async function completeGithubConnect(
  d: Deps,
  input: { state: string; installationId: number; code: string },
): Promise<{ userId: string; installation: InstallationRow }> {
  const userId = verifyState(input.state, d.stateSecret, nowOf(d).getTime());
  if (!userId)
    throw new WorkspaceError(
      "forbidden",
      "This connection link expired. Start again from BuildApps.",
    );
  if (!Number.isInteger(input.installationId) || input.installationId <= 0)
    throw new WorkspaceError("invalid", "Invalid installation");
  const g = gateway(d);
  let accessible;
  try {
    accessible = await g.userInstallations(input.code);
  } catch (e) {
    throw new WorkspaceError(
      "github_error",
      e instanceof GitHubError && e.status === 401
        ? "GitHub did not accept the authorization. Try again."
        : "Could not verify the GitHub installation",
    );
  }
  const info = accessible.find((i) => i.installationId === input.installationId);
  if (!info)
    throw new WorkspaceError("forbidden", "You do not have access to that GitHub installation");
  return { userId, installation: await d.stores.github.upsertInstallation(userId, info) };
}

export const listConnections = (d: Deps, userId: string) =>
  d.stores.github.listInstallations(userId);

async function ownedInstallation(d: Deps, userId: string, rowId: string): Promise<InstallationRow> {
  const row = await d.stores.github.getInstallation(userId, rowId);
  if (!row) throw new WorkspaceError("not_found", "GitHub connection not found");
  return row;
}

/** Repositories the user chose to share with the App on GitHub (that selection is the explicit authorization). */
export async function listConnectionRepos(
  d: Deps,
  userId: string,
  rowId: string,
): Promise<RepoInfo[]> {
  const row = await ownedInstallation(d, userId, rowId);
  try {
    return await gateway(d).listRepos(row.installationId);
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 404 || e.status === 403))
      throw new WorkspaceError(
        "not_connected",
        "GitHub access was revoked. Reconnect to continue.",
      );
    throw new WorkspaceError("github_error", "Could not list repositories");
  }
}

export async function linkProjectRepo(
  d: Deps,
  userId: string,
  projectId: string,
  rowId: string,
  fullName: string,
) {
  const project = await d.stores.projects.get(userId, projectId);
  if (!project) throw new WorkspaceError("not_found", "Project not found");
  const wanted = parseGitHubRepo(`https://github.com/${fullName}`);
  if (!wanted) throw new WorkspaceError("invalid", "Invalid repository");
  const repos = await listConnectionRepos(d, userId, rowId);
  const hit = repos.find(
    (r) => r.fullName.toLowerCase() === `${wanted.owner}/${wanted.name}`.toLowerCase(),
  );
  if (!hit)
    throw new WorkspaceError(
      "forbidden",
      "That repository is not shared with BuildApps. Add it in your GitHub App settings first.",
    );
  if (
    project.repo &&
    (project.repo.owner.toLowerCase() !== hit.owner.toLowerCase() ||
      project.repo.name.toLowerCase() !== hit.name.toLowerCase())
  )
    throw new WorkspaceError(
      "conflict",
      `This project is for ${project.repo.owner}/${project.repo.name}`,
    );
  await d.stores.projects.setRepo(
    userId,
    projectId,
    { provider: "github", owner: hit.owner, name: hit.name },
    rowId,
  );
  return { repo: hit.fullName };
}

/** Disconnect = revoke. We uninstall our App from GitHub unless a colleague still uses the same installation. */
export async function disconnectGithub(
  d: Deps,
  userId: string,
  rowId: string,
): Promise<{ removed: true; remoteRevoked: boolean; note?: string }> {
  const row = await ownedInstallation(d, userId, rowId);
  const others = (await d.stores.github.findByGithubId(row.installationId)).filter(
    (r) => r.userId !== userId,
  );
  let remoteRevoked = false;
  let note: string | undefined;
  if (others.length > 0)
    note =
      "Another BuildApps account uses this GitHub installation, so only your link was removed.";
  else if (d.gateway) {
    try {
      await d.gateway.uninstall(row.installationId);
      remoteRevoked = true;
    } catch {
      note =
        "Your link was removed, but GitHub could not be told to revoke access. Remove the app at github.com/settings/installations.";
    }
  }
  await d.stores.github.deleteInstallation(userId, rowId); // linked projects are unlinked automatically
  return { removed: true, remoteRevoked, ...(note ? { note } : {}) };
}

/** Webhook payloads arrive signature-verified (see verifyWebhookSignature). */
export async function handleGithubWebhook(
  d: Deps,
  event: string,
  payload: unknown,
): Promise<{ handled: boolean }> {
  const p = payload as {
    action?: string;
    installation?: { id?: number };
    repositories_removed?: { full_name?: string }[];
  };
  const id = p.installation?.id;
  if (typeof id !== "number") return { handled: false };
  if (event === "installation" && (p.action === "deleted" || p.action === "suspend")) {
    await d.stores.github.deleteByGithubId(id);
    return { handled: true };
  }
  if (event === "installation_repositories" && p.action === "removed") {
    for (const r of p.repositories_removed ?? []) {
      const [owner, name] = (r.full_name ?? "").split("/");
      if (owner && name) await d.stores.projects.unlinkRepo(id, owner, name);
    }
    return { handled: true };
  }
  return { handled: false };
}
