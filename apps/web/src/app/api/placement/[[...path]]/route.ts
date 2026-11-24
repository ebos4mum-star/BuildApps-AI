import { getPlacement, submitPlacement, WorkspaceError } from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { rateLimited } from "@/lib/http";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /:skillId": async ({ userId, params }) => ({
    check: await getPlacement(getDeps(), userId, params.skillId!),
  }),
  "POST /:skillId": async ({ userId, params, body }) => {
    // skill checks unlock content without XP, so cap guessing
    if (rateLimited(`placement:${userId}`, 12, 3_600_000))
      throw new WorkspaceError("rate_limited", "Too many skill checks - try again later");
    return submitPlacement(getDeps(), userId, params.skillId!, body);
  },
});
