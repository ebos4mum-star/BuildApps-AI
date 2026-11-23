import { createClient } from "@supabase/supabase-js";
import { FakeGitHubGateway, GitHubAppGateway, type GitHubGateway } from "@buildapps/github";
import {
  createMemoryStores,
  createSupabaseStores,
  verifyAccessToken,
  type Deps,
  type Stores,
} from "@buildapps/server";

/**
 * Backend selection (server only).
 * - Production: Supabase. Tokens are verified with Supabase Auth; writes use the service role.
 *   GitHub features need the GitHub App env vars; without them they report "unavailable".
 * - Local dev without Docker: DEV_MEMORY_BACKEND=1 uses in-memory stores, "dev:<name>" tokens and a
 *   fixture-backed fake GitHub. This is refused in production builds so it can never authenticate
 *   real traffic.
 */
export const devBackend = process.env.DEV_MEMORY_BACKEND === "1";
if (devBackend && process.env.NODE_ENV === "production") {
  throw new Error("DEV_MEMORY_BACKEND must never be enabled in production");
}

const g = globalThis as unknown as { __stores?: Stores; __gh?: GitHubGateway | null };

export function getStores(): Stores {
  if (g.__stores) return g.__stores;
  if (devBackend) {
    const stores = createMemoryStores();
    stores.db.admins.add("dev-admin"); // sign in as "admin" in dev mode to try the admin screens
    return (g.__stores = stores);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (see .env.example)");
  return (g.__stores = createSupabaseStores(
    createClient(url, key, { auth: { persistSession: false } }),
  ));
}

export function githubWebhookSecret(): string {
  return process.env.GITHUB_APP_WEBHOOK_SECRET ?? "";
}

function getGateway(): GitHubGateway | null {
  if (g.__gh !== undefined) return g.__gh;
  if (devBackend) return (g.__gh = new FakeGitHubGateway());
  const e = process.env;
  if (
    e.GITHUB_APP_ID &&
    e.GITHUB_APP_PRIVATE_KEY &&
    e.GITHUB_APP_SLUG &&
    e.GITHUB_APP_CLIENT_ID &&
    e.GITHUB_APP_CLIENT_SECRET
  ) {
    return (g.__gh = new GitHubAppGateway({
      appId: e.GITHUB_APP_ID,
      privateKey: e.GITHUB_APP_PRIVATE_KEY,
      slug: e.GITHUB_APP_SLUG,
      clientId: e.GITHUB_APP_CLIENT_ID,
      clientSecret: e.GITHUB_APP_CLIENT_SECRET,
    }));
  }
  return (g.__gh = null);
}

export function getDeps(): Deps {
  const stateSecret = devBackend
    ? "dev-only-state-secret-not-for-production"
    : (process.env.GITHUB_STATE_SECRET ?? "");
  const gateway = getGateway();
  if (gateway && stateSecret.length < 32)
    throw new Error("GITHUB_STATE_SECRET must be at least 32 characters");
  return { stores: getStores(), gateway, stateSecret };
}

/** Returns the authenticated user id for a bearer token, or null. */
export async function verifyToken(token: string): Promise<string | null> {
  if (devBackend) {
    const m = /^dev:([a-z0-9_-]{1,32})$/i.exec(token);
    return m ? `dev-${m[1]!.toLowerCase()}` : null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase is not configured (see .env.example)");
  return verifyAccessToken(url, anon, token);
}
