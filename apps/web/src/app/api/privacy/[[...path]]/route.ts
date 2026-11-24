import {
  cancelAccountDeletion,
  exportMyData,
  myDeletionRequest,
  requestAccountDeletion,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /export": async ({ userId }) => exportMyData(getDeps(), userId),
  "GET /deletion": async ({ userId }) => ({
    request: await myDeletionRequest(getDeps(), userId),
  }),
  "POST /deletion": async ({ userId, body }) => ({
    request: await requestAccountDeletion(getDeps(), userId, body),
  }),
  "DELETE /deletion": async ({ userId }) => ({
    request: await cancelAccountDeletion(getDeps(), userId),
  }),
});
