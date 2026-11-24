#!/usr/bin/env node
/* eslint-disable no-undef, no-console */
// Reports which integrations are configured. Prints NAMES only, never values. Exit 1 if a REQUIRED group is incomplete.
// Usage: node scripts/check-env.mjs [--production]
const env = process.env;
const prod = process.argv.includes("--production");
const groups = [
  {
    id: "Supabase (required)",
    required: true,
    keys: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  },
  {
    id: "GitHub App",
    required: false,
    keys: [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_APP_CLIENT_ID",
      "GITHUB_APP_CLIENT_SECRET",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_WEBHOOK_SECRET",
      "GITHUB_STATE_SECRET",
      "APP_URL",
    ],
  },
  { id: "Scheduler", required: false, keys: ["CRON_SECRET"] },
  { id: "Push (Expo)", required: false, keys: ["PUSH_PROVIDER"] },
  { id: "Email (webhook)", required: false, keys: ["EMAIL_WEBHOOK_URL", "EMAIL_WEBHOOK_SECRET"] },
];
let bad = false;
for (const g of groups) {
  const missing = g.keys.filter((k) => !env[k]);
  const status =
    missing.length === 0
      ? "configured"
      : missing.length === g.keys.length
        ? "not configured"
        : "INCOMPLETE";
  console.log(
    `${status.padEnd(15)} ${g.id}${missing.length && status === "INCOMPLETE" ? `  missing: ${missing.join(", ")}` : ""}`,
  );
  if (g.required && missing.length) bad = true;
  if (status === "INCOMPLETE" && prod) bad = true;
}
const problems = [];
if (env.GITHUB_STATE_SECRET && env.GITHUB_STATE_SECRET.length < 32)
  problems.push("GITHUB_STATE_SECRET must be at least 32 characters");
if (env.CRON_SECRET && env.CRON_SECRET.length < 32)
  problems.push("CRON_SECRET must be at least 32 characters");
if (env.EMAIL_WEBHOOK_URL && !env.EMAIL_WEBHOOK_URL.startsWith("https://"))
  problems.push("EMAIL_WEBHOOK_URL must use https");
if (env.PUSH_PROVIDER && env.PUSH_PROVIDER !== "expo")
  problems.push('PUSH_PROVIDER must be "expo" (or unset)');
if (prod && env.DEV_MEMORY_BACKEND) problems.push("DEV_MEMORY_BACKEND must be unset in production");
if (prod && env.DEV_COOLING_OFF_DAYS)
  problems.push("DEV_COOLING_OFF_DAYS must be unset in production");
if (prod && env.ALLOW_ACCOUNT_ERASURE === "1")
  problems.push("ALLOW_ACCOUNT_ERASURE is on: enable only during a deliberate, approved erasure");
for (const p of problems) console.log(`PROBLEM         ${p}`);
process.exit(bad || problems.length ? 1 : 0);
