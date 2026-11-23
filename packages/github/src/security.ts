import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();
const safeEq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/**
 * Signed, expiring OAuth `state` binding the GitHub install flow to the BuildApps user who started it.
 * Prevents CSRF and "attach someone else's installation to my account" replays.
 */
export function signState(
  userId: string,
  secret: string,
  now = Date.now(),
  ttlMs = 10 * 60_000,
): string {
  if (secret.length < 16) throw new Error("GitHub state secret is too short");
  const payload = b64u(
    JSON.stringify({ u: userId, e: now + ttlMs, n: randomBytes(8).toString("hex") }),
  );
  return `${payload}.${b64u(mac(secret, payload))}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): string | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || state.length > 1000) return null;
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (!safeEq(given, mac(secret, payload))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      e?: unknown;
    };
    return typeof u === "string" && typeof e === "number" && e > now ? u : null;
  } catch {
    return null;
  }
}

/** Verifies GitHub's `X-Hub-Signature-256` over the RAW request body. */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret || !header.startsWith("sha256=")) return false;
  let given: Buffer;
  try {
    given = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return safeEq(given, createHmac("sha256", secret).update(rawBody).digest());
}
