"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createApiClient } from "@buildapps/api-client";

/** Dev mode (no Supabase) is only offered when explicitly enabled; the server refuses it in production. */
export const DEV = process.env.NEXT_PUBLIC_DEV_BACKEND === "1";
const DEV_KEY = "buildapps.dev.user";

let supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error("Supabase is not configured. Copy .env.example to .env.local.");
    supabase = createClient(url, key);
  }
  return supabase;
}

export async function getToken(): Promise<string | null> {
  if (DEV) {
    const name = localStorage.getItem(DEV_KEY);
    return name ? `dev:${name}` : null;
  }
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
export const devSignIn = (name: string) =>
  localStorage.setItem(
    DEV_KEY,
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 32) || "learner",
  );
export async function signOut() {
  if (DEV) localStorage.removeItem(DEV_KEY);
  else await getSupabase().auth.signOut();
}

export const api = createApiClient({ baseUrl: "", getToken });
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
