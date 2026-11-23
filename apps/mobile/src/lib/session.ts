import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { createApiClient } from "@buildapps/api-client";

declare const process: { env: Record<string, string | undefined> };

// Same Supabase project and API as the website => one account, one progress history.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:14321",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "missing-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
