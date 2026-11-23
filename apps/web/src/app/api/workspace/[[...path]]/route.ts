import { z } from "zod";
import {
  getWorkspace,
  linkProjectRepo,
  runScan,
  runVerification,
  setFindingStatus,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // scans fetch a bounded sample of files from GitHub

const repoBody = z.object({
  installationId: z.string().min(1).max(128),
  repo: z.string().min(3).max(140),
});

export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /:project": async ({ userId, params }) => getWorkspace(getDeps(), userId, params.project!),
  "POST /:project/repo": async ({ userId, params, body }) => {
    const b = repoBody.parse(body);
    return linkProjectRepo(getDeps(), userId, params.project!, b.installationId, b.repo);
  },
  "POST /:project/scan": async ({ userId, params }) => {
    const r = await runScan(getDeps(), userId, params.project!);
    return {
      scanId: r.scan.id,
      sync: r.sync,
      verified: r.verified,
      summary: r.summary,
      limits: r.limits,
    };
  },
  "POST /:project/verify": async ({ userId, params }) => {
    const r = await runVerification(getDeps(), userId, params.project!);
    return { runId: r.run.id, checks: r.run.checks, verified: r.verified, sync: r.sync };
  },
  "PATCH /:project/findings/:finding": async ({ userId, params, body }) => ({
    finding: await setFindingStatus(getDeps(), userId, params.project!, params.finding!, body),
  }),
});
