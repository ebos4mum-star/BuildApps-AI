import type { EmailProvider, ProviderResult, PushProvider } from "./notification-service";

/**
 * Generic delivery adapters. Both are provider-independent in design and NOT verified against live services
 * in this repository: they are never created unless the operator configures them (see docs/INTEGRATIONS.md).
 */
type Fetch = typeof fetch;

const classify = (status: number): ProviderResult =>
  status >= 500 || status === 429
    ? { ok: false, retryable: true, error: `HTTP ${status}` }
    : { ok: false, retryable: false, error: `HTTP ${status}` };

/** Expo's documented push API. Works for Expo push tokens (ExponentPushToken[...]). */
export function expoPushProvider(fetchImpl: Fetch = fetch, accessToken?: string): PushProvider {
  return {
    name: "expo",
    async send(m) {
      if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(m.token))
        return { ok: false, retryable: false, error: "not an Expo push token", invalidToken: true };
      try {
        const res = await fetchImpl("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            to: m.token,
            title: m.title,
            body: m.body ?? undefined,
            data: m.link ? { link: m.link } : undefined,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return classify(res.status);
        const json = (await res.json().catch(() => ({}))) as {
          data?: { status?: string; details?: { error?: string } };
        };
        if (json.data?.status === "ok") return { ok: true };
        if (json.data?.details?.error === "DeviceNotRegistered")
          return { ok: false, retryable: false, error: "DeviceNotRegistered", invalidToken: true };
        return { ok: false, retryable: false, error: json.data?.details?.error ?? "rejected" };
      } catch (e) {
        return {
          ok: false,
          retryable: true,
          error: e instanceof Error ? e.message : "network error",
        };
      }
    },
  };
}

/** Posts JSON to a URL you control (a serverless function, an email vendor's webhook, a relay). */
export function webhookEmailProvider(
  url: string,
  secret: string,
  fetchImpl: Fetch = fetch,
): EmailProvider {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("The email webhook must use https");
  return {
    name: "webhook",
    async send(m) {
      try {
        const res = await fetchImpl(u, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify(m),
          signal: AbortSignal.timeout(10_000),
        });
        return res.ok ? { ok: true } : classify(res.status);
      } catch (e) {
        return {
          ok: false,
          retryable: true,
          error: e instanceof Error ? e.message : "network error",
        };
      }
    },
  };
}
