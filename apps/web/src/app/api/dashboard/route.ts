import { disabledLessonIds, getDashboard } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) =>
  handle(req, async (userId) =>
    json(
      await getDashboard(
        getStores().progress,
        userId,
        new Date(),
        await disabledLessonIds(getStores()),
      ),
    ),
  );
