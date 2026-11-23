import { z } from "zod";
import { submitAttempt } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json, rateLimited, readJson, fail } from "@/lib/http";

const body = z.object({
  exerciseId: z.string().min(1).max(128),
  answer: z.unknown(),
  timeZone: z.string().max(64).optional(),
});

export const POST = (req: Request) =>
  handle(req, async (userId) => {
    if (rateLimited(`attempt:${userId}`, 60))
      return fail(429, "rate_limited", "Slow down a little");
    const b = body.parse(await readJson(req));
    // Only (exerciseId, answer) are accepted: pass/fail, XP and streaks are decided server-side.
    return json(
      await submitAttempt(getStores().progress, {
        userId,
        exerciseId: b.exerciseId,
        answer: b.answer,
        ...(b.timeZone ? { timeZone: b.timeZone } : {}),
      }),
    );
  });
