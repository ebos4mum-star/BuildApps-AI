import {
  applyAsExpert,
  expertAccept,
  expertAddJobMilestone,
  expertDecline,
  expertGetRequest,
  expertListRequests,
  expertMarkDelivered,
  expertSubmitJobMilestone,
  expertWorkspace,
  getMyExpertProfile,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";

export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /profile": async ({ userId }) => ({ profile: await getMyExpertProfile(getDeps(), userId) }),
  "PUT /profile": async ({ userId, body }) => ({
    profile: await applyAsExpert(getDeps(), userId, body),
  }),
  "GET /requests": async ({ userId }) => ({
    requests: await expertListRequests(getDeps(), userId),
  }),
  "GET /requests/:id": async ({ userId, params }) =>
    expertGetRequest(getDeps(), userId, params.id!),
  "GET /requests/:id/workspace": async ({ userId, params }) =>
    expertWorkspace(getDeps(), userId, params.id!),
  "POST /requests/:id/accept": async ({ userId, params }) => ({
    request: await expertAccept(getDeps(), userId, params.id!),
  }),
  "POST /requests/:id/decline": async ({ userId, params }) => ({
    request: await expertDecline(getDeps(), userId, params.id!),
  }),
  "POST /requests/:id/deliver": async ({ userId, params }) => ({
    request: await expertMarkDelivered(getDeps(), userId, params.id!),
  }),
  "POST /requests/:id/jobs": async ({ userId, params, body }) => ({
    job: await expertAddJobMilestone(getDeps(), userId, params.id!, body),
  }),
  "POST /requests/:id/jobs/:job/submit": async ({ userId, params, body }) => ({
    job: await expertSubmitJobMilestone(getDeps(), userId, params.id!, params.job!, body),
  }),
});
