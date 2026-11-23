import { reportMilestone } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json } from "@/lib/http";

/** Self-report only. Verified completion is never settable through a client-facing route. */
export const POST = (req: Request, ctx: { params: Promise<{ id: string; key: string }> }) =>
  handle(req, async (userId) => {
    const { id, key } = await ctx.params;
    return json({ project: await reportMilestone(getStores().projects, userId, id, key) });
  });
