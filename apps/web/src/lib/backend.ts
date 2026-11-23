import { createClient } from "@supabase/supabase-js";
import {
  createMemoryStores,
  createSupabaseStores,
  verifyAccessToken,
  type Stores,
} from "@buildapps/server";

/**
 * Backend selection (server only).
 * - Production: Supabase. Tokens are verified with Supabase Auth; writes use the service role.
 * - Local dev without Docker: DEV_MEMORY_BACKEND=1 uses in-memory stores and "dev:<name>" tokens.
 *   This is refused in production builds so it can never authenticate real traffic.
 */
export const devBackend = process.env.DEV_MEMORY_BACKEND === "1";
if (devBackend && process.env.NODE_ENV === "production") {
  throw new Error("DEV_MEMORY_BACKEND must never be enabled in production");
}

const g = globalThis as unknown as { __stores?: Stores };

export function getStores(): Stores {
  if (g.__stores) return g.__stores;
  if (devBackend) return (g.__stores = createMemoryStores());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (see .env.example)");
  return (g.__stores = createSupabaseStores(
    createClient(url, key, { auth: { persistSession: false } }),
  ));
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
