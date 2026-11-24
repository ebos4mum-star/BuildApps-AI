import { disabledLessonIds, getLessonForUser } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { fail, handle, json } from "@/lib/http";

export const GET = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(req, async (userId) => {
    const { id } = await ctx.params;
    const lesson = await getLessonForUser(
      getStores().progress,
      userId,
      id,
      await disabledLessonIds(getStores()),
    );
    return lesson ? json(lesson) : fail(403, "locked", "Lesson not available yet");
  });
