import { completeGithubConnect, WorkspaceError } from "@buildapps/server";
import { getDeps } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * GitHub redirects the user's browser here after installing the App. There is no bearer token on a
 * browser redirect, so the signed `state` (bound to the BuildApps user, 10-minute expiry) plus the
 * OAuth `code` (proving the GitHub user controls the installation) authenticate this request.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = process.env.APP_URL ?? u.origin;
  const back = (q: string) => Response.redirect(`${base}/projects?${q}`, 303);
  if (u.searchParams.get("setup_action") === "request") return back("github=pending"); // org owner must approve first
  try {
    await completeGithubConnect(getDeps(), {
      state: u.searchParams.get("state") ?? "",
      installationId: Number(u.searchParams.get("installation_id")),
      code: u.searchParams.get("code") ?? "",
    });
    return back("github=connected");
  } catch (e) {
    const reason = e instanceof WorkspaceError ? e.message : "Could not connect GitHub";
    return back(`github=error&reason=${encodeURIComponent(reason)}`);
  }
}
