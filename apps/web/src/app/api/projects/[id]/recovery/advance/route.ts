import { advanceProjectRecovery } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json } from "@/lib/http";

export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(req, async (userId) =>
    json({
      project: await advanceProjectRecovery(getStores().projects, userId, (await ctx.params).id),
    }),
  );
