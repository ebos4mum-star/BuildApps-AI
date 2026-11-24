import { z } from "zod";
import { disabledLessonIds, submitAttempt } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json, rateLimited, readJson, fail } from "@/lib/http";

/** Default 60/min per user; only tests that script a whole curriculum raise it. */
const ATTEMPTS_PER_MINUTE = Number(process.env.ATTEMPT_RATE_LIMIT) || 60;

const body = z.object({
  exerciseId: z.string().min(1).max(128),
  answer: z.unknown(),
  timeZone: z.string().max(64).optional(),
});

export const POST = (req: Request) =>
  handle(req, async (userId) => {
    if (rateLimited(`attempt:${userId}`, ATTEMPTS_PER_MINUTE))
      return fail(429, "rate_limited", "Slow down a little");
    const b = body.parse(await readJson(req));
    // Only (exerciseId, answer) are accepted: pass/fail, XP and streaks are decided server-side.
    return json(
      await submitAttempt(getStores().progress, {
        userId,
        exerciseId: b.exerciseId,
        answer: b.answer,
        disabledLessons: await disabledLessonIds(getStores()),
        ...(b.timeZone ? { timeZone: b.timeZone } : {}),
      }),
    );
  });
