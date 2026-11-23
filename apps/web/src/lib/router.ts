import { fail, handle, json, readJson } from "./http";

export interface RouteContext {
  userId: string;
  params: Record<string, string>;
  body: unknown;
  query: URLSearchParams;
}
export type Route = (c: RouteContext) => Promise<unknown>;

const SAFE_PARAM = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Tiny pattern router so related endpoints live in one reviewed file.
 * Keys look like "POST /requests/:id/handoff". Every request is authenticated by `handle`.
 */
export function makeRouter(routes: Record<string, Route>) {
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, path] = key.split(" ") as [string, string];
    return { method, segs: path.split("/").filter(Boolean), handler };
  });
  const run = (req: Request, ctx: { params: Promise<{ path?: string[] }> }) =>
    handle(req, async (userId) => {
      const path = (await ctx.params).path ?? [];
      for (const r of compiled) {
        if (r.method !== req.method || r.segs.length !== path.length) continue;
        const params: Record<string, string> = {};
        const ok = r.segs.every((seg, i) => {
          const actual = path[i]!;
          if (!seg.startsWith(":")) return seg === actual;
          if (!SAFE_PARAM.test(actual)) return false;
          params[seg.slice(1)] = actual;
          return true;
        });
        if (!ok) continue;
        const body =
          req.method === "GET" || req.method === "DELETE" ? undefined : await readJson(req);
        return json(
          await r.handler({ userId, params, body, query: new URL(req.url).searchParams }),
        );
      }
      return fail(404, "not_found", "Unknown endpoint");
    });
  return { GET: run, POST: run, PUT: run, PATCH: run, DELETE: run };
}
