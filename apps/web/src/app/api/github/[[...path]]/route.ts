import { z } from "zod";
import {
  disconnectGithub,
  listConnectionRepos,
  listConnections,
  startGithubConnect,
} from "@buildapps/server";
import { getDeps } from "@/lib/backend";
import { makeRouter } from "@/lib/router";

export const dynamic = "force-dynamic";
const id = z.string().min(1).max(128);

export const { GET, POST, PUT, PATCH, DELETE } = makeRouter({
  "GET /": async ({ userId }) => {
    const d = getDeps();
    return { available: d.gateway !== null, connections: await listConnections(d, userId) };
  },
  "POST /connect": async ({ userId }) => startGithubConnect(getDeps(), userId),
  "GET /connections/:id/repos": async ({ userId, params }) => ({
    repos: await listConnectionRepos(getDeps(), userId, id.parse(params.id)),
  }),
  "DELETE /connections/:id": async ({ userId, params }) =>
    disconnectGithub(getDeps(), userId, id.parse(params.id)),
});
