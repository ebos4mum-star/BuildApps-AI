import { ZodError } from "zod";
import { AttemptError, ProjectError, WorkspaceError } from "@buildapps/server";
import { getStores, verifyToken } from "./backend";

const STATUS: Record<string, number> = {
  unknown_exercise: 404,
  locked: 403,
  invalid_answer: 400,
  busy: 503,
  not_found: 404,
  forbidden_transition: 409,
  invalid: 400,
  forbidden: 403,
  not_connected: 409,
  rate_limited: 429,
  conflict: 409,
  github_error: 502,
  unavailable: 503,
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export const fail = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

/** Naive per-process limiter: a safety net against runaway clients; real quotas belong in the DB. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

export async function handle(
  req: Request,
  fn: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
    const userId = m ? await verifyToken(m[1]!) : null;
    if (!userId) return fail(401, "unauthenticated", "Please sign in");
    if (await getStores().ops.isSuspended(userId))
      return fail(403, "account_suspended", "This account is suspended. Please contact support.");
    if (rateLimited(userId, 240)) return fail(429, "rate_limited", "Slow down a little");
    return await fn(userId);
  } catch (e) {
    if (e instanceof AttemptError || e instanceof ProjectError || e instanceof WorkspaceError)
      return fail(STATUS[e.code] ?? 400, e.code, e.message);
    if (e instanceof ZodError) return fail(400, "invalid", "Invalid request");
    console.error("api error", e);
    return fail(500, "server_error", "Something went wrong");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 20_000) throw new ProjectError("invalid", "Request too large");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProjectError("invalid", "Invalid JSON");
  }
}
