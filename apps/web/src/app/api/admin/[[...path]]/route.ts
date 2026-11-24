import { z } from "zod";
import {
  adminListAudit,
  adminListDeletions,
  adminRecordErasure,
  adminListContent,
  adminListReports,
  adminListSupport,
  adminListUsers,
  adminOverview,
  adminReviewReport,
  adminSetLessonDisabled,
  adminSetSuspension,
  adminUpdateSupport,
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
  "GET /overview": async ({ userId }) => adminOverview(getDeps(), userId),
  "GET /users": async ({ userId, query }) => ({
    users: await adminListUsers(getDeps(), userId, query.get("q") ?? undefined),
  }),
  "POST /users/:id/suspension": async ({ userId, params, body }) => ({
    user: await adminSetSuspension(getDeps(), userId, params.id!, body),
  }),
  "GET /privacy/deletions": async ({ userId, query }) => ({
    deletions: await adminListDeletions(getDeps(), userId, query.get("status") ?? undefined),
  }),
  "POST /privacy/deletions/:id/erasure": async ({ userId, params, body }) => ({
    deletion: await adminRecordErasure(getDeps(), userId, params.id!, body),
  }),
  "GET /support": async ({ userId, query }) => ({
    support: await adminListSupport(getDeps(), userId, query.get("status") ?? undefined),
  }),
  "POST /support/:id": async ({ userId, params, body }) => ({
    support: await adminUpdateSupport(getDeps(), userId, params.id!, body),
  }),
  "GET /reports": async ({ userId, query }) => ({
    reports: await adminListReports(getDeps(), userId, query.get("status") ?? undefined),
  }),
  "POST /reports/:id/review": async ({ userId, params, body }) => ({
    report: await adminReviewReport(getDeps(), userId, params.id!, body),
  }),
  "GET /audit": async ({ userId }) => ({ audit: await adminListAudit(getDeps(), userId) }),
  "GET /content": async ({ userId }) => ({ lessons: await adminListContent(getDeps(), userId) }),
  "POST /content/:id": async ({ userId, params, body }) => ({
    flag: await adminSetLessonDisabled(getDeps(), userId, params.id!, body),
  }),
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
