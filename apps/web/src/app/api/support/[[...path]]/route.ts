import { createAbuseReport, createSupportRequest, listMySupport } from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /": async ({ userId }) => ({ support: await listMySupport(getDeps(), userId) }),
  "POST /": async ({ userId, body }) => ({
    support: await createSupportRequest(getDeps(), userId, body),
  }),
  "POST /report": async ({ userId, body }) => {
    await createAbuseReport(getDeps(), userId, body);
    return { ok: true };
  },
});
