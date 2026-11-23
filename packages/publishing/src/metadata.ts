import { z } from "zod";

/** Patterns that must never be stored in publishing metadata (store review notes often tempt people to paste logins). */
const SECRET_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\b(sk|rk)_live_[0-9A-Za-z]{16,}\b/,
  /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(password|passwd|pwd|secret|api[_ -]?key|token)\s*[:=]\s*\S{4,}/i,
];
export const looksLikeSecret = (s: string): boolean => SECRET_PATTERNS.some((re) => re.test(s));

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !looksLikeSecret(v),
      "Do not enter passwords, tokens or keys here. Share review access through the store's own demo-account fields.",
    );
const https = z
  .string()
  .trim()
  .max(300)
  .url()
  .regex(/^https:\/\//, "Must be an https:// address");
const reverseDns = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;

/** All fields optional so users can fill the form gradually; readiness decides what is still missing. */
export const metadataSchema = z
  .object({
    appName: text(30),
    shortDescription: text(80),
    description: text(4000),
    category: text(50),
    supportUrl: https,
    privacyPolicyUrl: https,
    marketingUrl: https,
    bundleId: z
      .string()
      .trim()
      .max(155)
      .regex(reverseDns, "Use reverse-DNS form, e.g. com.example.myapp"),
    packageName: z
      .string()
      .trim()
      .max(155)
      .regex(
        /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
        "Lower-case reverse-DNS form, e.g. com.example.myapp",
      ),
    siteUrl: https,
    hasLogin: z.boolean(),
    collectsUserData: z.boolean(),
    reviewNotes: text(2000),
  })
  .partial()
  .strict();
export type TargetMetadata = z.infer<typeof metadataSchema>;

/** Which metadata fields make sense on each platform (others are rejected rather than silently stored). */
export const METADATA_FIELDS = {
  common: [
    "appName",
    "shortDescription",
    "description",
    "category",
    "supportUrl",
    "privacyPolicyUrl",
    "marketingUrl",
    "hasLogin",
    "collectsUserData",
    "reviewNotes",
  ],
  apple_app_store: ["bundleId"],
  google_play: ["packageName"],
  web: ["siteUrl"],
} as const;

export function validateMetadata(
  platform: keyof typeof METADATA_FIELDS,
  input: unknown,
): { ok: true; value: TargetMetadata } | { ok: false; error: string } {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join(".") || "metadata"}: ${parsed.error.issues[0].message}`
        : "Invalid metadata",
    };
  const allowed = new Set<string>([
    ...METADATA_FIELDS.common,
    ...(platform === "web" || platform === "apple_app_store" || platform === "google_play"
      ? METADATA_FIELDS[platform]
      : []),
  ]);
  const bad = Object.keys(parsed.data).find((k) => !allowed.has(k));
  if (bad) return { ok: false, error: `${bad} does not apply to this publishing target` };
  return { ok: true, value: parsed.data };
}
