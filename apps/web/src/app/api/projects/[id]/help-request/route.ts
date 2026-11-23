import { z } from "zod";
import { askForHumanHelp } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json, readJson } from "@/lib/http";

const body = z.object({ summary: z.string().max(2000) });
export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(req, async (userId) => {
    const { summary } = body.parse(await readJson(req));
    return json({
      project: await askForHumanHelp(getStores().projects, userId, (await ctx.params).id, summary),
    });
  });
