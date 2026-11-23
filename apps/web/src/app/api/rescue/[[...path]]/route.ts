import {
  cancelRequest,
  completeRequest,
  decideJobMilestone,
  getMyRequest,
  grantHandoff,
  listMyRequests,
  revokeHandoff,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";

/** Project-owner side of Human Developer Rescue. No payment endpoints exist in V1. */
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /requests": async ({ userId }) => ({ requests: await listMyRequests(getDeps(), userId) }),
  "GET /requests/:id": async ({ userId, params }) => getMyRequest(getDeps(), userId, params.id!),
  "POST /requests/:id/handoff": async ({ userId, params, body }) => ({
    handoff: await grantHandoff(getDeps(), userId, params.id!, body),
  }),
  "DELETE /requests/:id/handoff": async ({ userId, params }) =>
    revokeHandoff(getDeps(), userId, params.id!),
  "POST /requests/:id/jobs/:job/decision": async ({ userId, params, body }) => ({
    job: await decideJobMilestone(getDeps(), userId, params.id!, params.job!, body),
  }),
  "POST /requests/:id/complete": async ({ userId, params }) => ({
    request: await completeRequest(getDeps(), userId, params.id!),
  }),
  "POST /requests/:id/cancel": async ({ userId, params }) => ({
    request: await cancelRequest(getDeps(), userId, params.id!),
  }),
});
