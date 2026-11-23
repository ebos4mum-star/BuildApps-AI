import { z } from "zod";
import {
  adminListExperts,
  adminListRequests,
  adminMatch,
  adminReviewExpert,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
const expertStatus = z.enum(["pending", "approved", "rejected", "suspended"]).optional();
const requestStatus = z
  .enum(["submitted", "matched", "in_progress", "delivered", "completed", "cancelled"])
  .optional();

/** Administrator-only. Membership lives in the `admins` table, managed by the project owner via SQL. */
export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /me": async ({ userId }) => ({ admin: await getDeps().stores.rescue.isAdmin(userId) }),
  "GET /experts": async ({ userId, query }) => ({
    experts: await adminListExperts(
      getDeps(),
      userId,
      expertStatus.parse(query.get("status") ?? undefined),
    ),
  }),
  "POST /experts/:id/review": async ({ userId, params, body }) => ({
    expert: await adminReviewExpert(getDeps(), userId, params.id!, body),
  }),
  "GET /requests": async ({ userId, query }) => ({
    requests: await adminListRequests(
      getDeps(),
      userId,
      requestStatus.parse(query.get("status") ?? undefined),
    ),
  }),
  "POST /requests/:id/match": async ({ userId, params, body }) => ({
    request: await adminMatch(
      getDeps(),
      userId,
      params.id!,
      z.object({ expertId: z.string().min(1).max(128) }).parse(body).expertId,
    ),
  }),
});
