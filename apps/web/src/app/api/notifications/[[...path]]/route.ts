import { listNotifications, markNotificationsRead } from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /": async ({ userId }) => ({ notifications: await listNotifications(getDeps(), userId) }),
  "POST /read": async ({ userId, body }) => markNotificationsRead(getDeps(), userId, body),
});
