import {
  addCorrectiveAction,
  addTarget,
  createRelease,
  getPublishing,
  markInReview,
  markReleased,
  markReleaseReady,
  recordResubmission,
  recordReviewOutcome,
  recordSubmission,
  requestPublishingAssistance,
  saveMetadata,
  setRequirementClaim,
  unreadyRelease,
  updateCorrectiveAction,
  withdrawRelease,
} from "@buildapps/server";
import { z } from "zod";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";

/**
 * Publishing Center. BuildApps submits NOTHING to any store: these endpoints only track what the
 * owner reports. Every handler resolves ownership server-side and none accepts a "verified" status.
 */
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /projects/:project": async ({ userId, params }) =>
    getPublishing(getDeps(), userId, params.project!),
  "POST /projects/:project/targets": async ({ userId, params, body }) => ({
    target: await addTarget(
      getDeps(),
      userId,
      params.project!,
      z.object({ platform: z.string() }).parse(body).platform,
    ),
  }),
  "POST /projects/:project/assistance": async ({ userId, params, body }) =>
    requestPublishingAssistance(getDeps(), userId, params.project!, body),
  "PUT /targets/:target/metadata": async ({ userId, params, body }) => ({
    target: await saveMetadata(getDeps(), userId, params.target!, body),
  }),
  "PUT /targets/:target/claims/:key": async ({ userId, params, body }) =>
    setRequirementClaim(getDeps(), userId, params.target!, params.key!, body),
  "DELETE /targets/:target/claims/:key": async ({ userId, params }) =>
    setRequirementClaim(getDeps(), userId, params.target!, params.key!, null),
  "POST /targets/:target/releases": async ({ userId, params, body }) => ({
    release: await createRelease(getDeps(), userId, params.target!, body),
  }),
  "POST /releases/:release/ready": async ({ userId, params }) => ({
    release: await markReleaseReady(getDeps(), userId, params.release!),
  }),
  "POST /releases/:release/unready": async ({ userId, params }) => ({
    release: await unreadyRelease(getDeps(), userId, params.release!),
  }),
  "POST /releases/:release/submitted": async ({ userId, params, body }) =>
    recordSubmission(getDeps(), userId, params.release!, body),
  "POST /releases/:release/in-review": async ({ userId, params }) => ({
    release: await markInReview(getDeps(), userId, params.release!),
  }),
  "POST /releases/:release/outcome": async ({ userId, params, body }) =>
    recordReviewOutcome(getDeps(), userId, params.release!, body),
  "POST /releases/:release/resubmitted": async ({ userId, params, body }) =>
    recordResubmission(getDeps(), userId, params.release!, body),
  "POST /releases/:release/released": async ({ userId, params }) => ({
    release: await markReleased(getDeps(), userId, params.release!),
  }),
  "POST /releases/:release/withdraw": async ({ userId, params }) => ({
    release: await withdrawRelease(getDeps(), userId, params.release!),
  }),
  "POST /releases/:release/actions": async ({ userId, params, body }) => ({
    action: await addCorrectiveAction(getDeps(), userId, params.release!, body),
  }),
  "PATCH /actions/:action": async ({ userId, params, body }) => ({
    action: await updateCorrectiveAction(getDeps(), userId, params.action!, body),
  }),
});
