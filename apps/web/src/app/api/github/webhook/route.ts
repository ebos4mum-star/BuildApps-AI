import { handleGithubWebhook } from "@buildapps/server";
import { verifyWebhookSignature } from "@buildapps/github";
import { getDeps, githubWebhookSecret } from "@/lib/backend";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Keeps BuildApps in sync when users uninstall the App or remove repositories on GitHub. */
export async function POST(req: Request) {
  const secret = githubWebhookSecret();
  if (!secret) return fail(503, "unavailable", "Webhook is not configured");
  const raw = await req.text(); // signature is over the exact raw bytes
  if (
    raw.length > 1_000_000 ||
    !verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret)
  )
    return fail(401, "unauthenticated", "Bad signature");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail(400, "invalid", "Invalid JSON");
  }
  return json(
    await handleGithubWebhook(getDeps(), req.headers.get("x-github-event") ?? "", payload),
  );
}
