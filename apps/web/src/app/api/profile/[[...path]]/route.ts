import { getMyProfile, saveMyProfile } from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /": async ({ userId }) => ({ profile: await getMyProfile(getDeps(), userId) }),
  "PUT /": async ({ userId, body }) => ({ profile: await saveMyProfile(getDeps(), userId, body) }),
});
