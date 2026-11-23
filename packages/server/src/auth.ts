import { createClient } from "@supabase/supabase-js";

/**
 * Verifies a Supabase access token (web cookie/header or mobile session) with Supabase Auth and
 * returns the user id, or null. Uses the public anon key: no privileged credential is involved.
 */
export async function verifyAccessToken(
  url: string,
  anonKey: string,
  token: string,
): Promise<string | null> {
  if (!token || token.length > 4096) return null;
  const { data, error } = await createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
