import { z } from "zod";
import { PROJECT_STATES } from "@buildapps/core";
import { changeProjectState } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json, readJson } from "@/lib/http";

const body = z.object({ state: z.enum(PROJECT_STATES) });
export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(req, async (userId) => {
    const { state } = body.parse(await readJson(req));
    return json({
      project: await changeProjectState(getStores().projects, userId, (await ctx.params).id, state),
    });
  });
