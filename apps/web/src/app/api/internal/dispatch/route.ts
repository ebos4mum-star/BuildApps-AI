import { timingSafeEqual } from "node:crypto";
import { dispatchOutbox, enqueueDueReminders, enqueueWeeklySummaries } from "@buildapps/server";
import { getDeps } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Scheduler entry point (hosted cron, Supabase pg_cron + pg_net, any scheduler). Disabled unless CRON_SECRET is set
 * (32+ chars), and then requires it as a bearer token. Safe to call every few minutes: all steps are idempotent.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32)
    return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return Response.json(
      { error: { code: "unauthorized", message: "Unauthorized" } },
      { status: 401 },
    );
  const d = getDeps();
  const reminders = await enqueueDueReminders(d);
  const weekly = await enqueueWeeklySummaries(d);
  const delivery = await dispatchOutbox(d, d.notifications ?? {});
  return Response.json(
    { reminders, weekly, delivery },
    { headers: { "Cache-Control": "no-store" } },
  );
}
