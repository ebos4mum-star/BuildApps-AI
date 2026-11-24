import {
  getAccountView,
  registerDevice,
  saveNotificationPrefs,
  unregisterDevice,
  updateAccount,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /": async ({ userId }) => getAccountView(getDeps(), userId),
  "PUT /": async ({ userId, body }) => ({ account: await updateAccount(getDeps(), userId, body) }),
  "PUT /notifications": async ({ userId, body }) => ({
    notifications: await saveNotificationPrefs(getDeps(), userId, body),
  }),
  "POST /devices": async ({ userId, body }) => {
    await registerDevice(getDeps(), userId, body);
    return { ok: true };
  },
  "POST /devices/remove": async ({ userId, body }) => {
    await unregisterDevice(getDeps(), userId, body);
    return { ok: true };
  },
});
