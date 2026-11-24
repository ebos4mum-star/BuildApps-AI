# BuildApps AI — V1 Architecture

A gamified platform that teaches practical AI-assisted app development and helps users
finish real projects. Not a chatbot.

## Layout

- `apps/web` Next.js, `apps/mobile` Expo (added in later milestones)
- `packages/core` pure domain logic (XP, streaks, journeys) · `packages/lessons` version-controlled
  lesson content + grader · `packages/db` Supabase migrations/types · `packages/api-client`
  · `packages/config` shared tsconfig
- `supabase/` migrations, seed, edge functions

## Journeys

Every project is created through one of: **start**, **continue**, **rescue**.

## Six V1 features

1. Learn by Doing 2. Project Rescue Scanner 3. Live Project Workspace
2. Build Verification Lab 5. Human Developer Rescue (vetted experts, manual matching,
   service requests, scoped handoffs, work verification — no open marketplace in V1)
3. Publishing Center (assistance subscription, planned $25/app/year)

## Security rules

- RLS on every table, deny by default, ownership via `user_id`; RLS tests required.
- GitHub: read-only GitHub App (contents + metadata), per-repo install, short-lived tokens
  minted server-side only.
- Never execute untrusted user code outside an isolated sandbox.
- AI calls server-side only with per-user quotas and logged usage.
- Secrets only in env vars; `.env.example` documents them; CI runs secret scanning.
- Entitlements stored once in Supabase and shared by iOS, Android and web. Apple/Google
  in-app purchase rules must be reviewed before any mobile billing is built.

## Roadmap

M1 foundation · M2 core logic · M3 lessons + grader · M4 Supabase schema/RLS ·
M5 web · M6 mobile. Later: Rescue Scanner, Workspace, Verification Lab, Human Rescue, Publishing.

## Status after Batch 1

- `packages/server`: the only code path that turns an answer into progress
  (grade -> XP -> streak -> skill level-ups -> achievements -> one atomic `apply_attempt` RPC).
  Clients send only `(exerciseId, answer)`; pass/fail, XP and verification are never client-supplied.
- Lessons ship to clients with solutions, explanations and option feedback stripped; they are
  revealed only in the grading response.
- Database: RLS on all tables, SELECT-only for clients, server-only writes, `UNIQUE(user_id, award_key)`
  for idempotent XP, optimistic-concurrency `version` on `user_progress`.
- Known limits: per-process rate limiting only; web uses client-side sessions with bearer tokens
  (no SSR auth); `SupabaseProgressStore`/`SupabaseProjectStore` are not yet exercised against a live
  Supabase (only the SQL is tested against real Postgres, and the logic against in-memory stores).
- Mobile billing is intentionally absent: Apple/Google in-app purchase rules must be reviewed
  before the $25/app/year Publishing Assistance is sold in-app.

## Status after the completion pass (admin, curriculum, gamification)

- **Curriculum**: 20 skills, 33 lessons (106 exercises) across 10 units (AI builders, specs, prompting, frontend, UX, flows,
  backend, databases/Supabase, auth, integrations, security/privacy, debugging, testing, shipping, maintenance).
  Content is validated by tests (solvable, explained, mixed exercise types) and played end to end in the browser.
- **Gamification** (all server-computed): XP, non-punitive streaks, skill levels, 13 achievements,
  daily/weekly quests (`core/quests.ts`; reward keys are per quest per period, so they are granted once),
  personalized practice (review of passed exercises from the weakest skills; no XP), and project-linked
  lessons recommended from the open findings of a project's latest scan (`server/project-learning.ts`).
- **Admin operations** (`server/ops-*.ts`, migration `20260105000000_admin_ops.sql`): user suspension (checked on
  every authenticated API call), support requests, abuse reports, learning-content withholding, notifications,
  and an append-only `admin_audit` log (immutable by trigger, even for the service role). Expert approval,
  suspension and manual matching are audited. Clients have SELECT-only access to their own support requests,
  reports and notifications; everything else is server-only.
- **Verification**: unit tests, real-Postgres RLS tests, real local Supabase integration tests (CI),
  and five browser suites in `apps/web/e2e` (lessons, Stage 3-5 journey, publishing, cross-platform shared state,
  admin operations). The mobile app is type-checked and bundled for Android/iOS, and shares one API client with
  the web (a static parity test fails if either UI stops using an API operation). Native iOS/Android
  _runtime_ behaviour has not been verified in this environment.

## Status after the experience pass

- **Curriculum**: 63 lessons / 212 exercises in 3 progressive paths (beginner, intermediate, advanced) across 29 units
  and 22 skills, including 5 interactive debugging cases and 3 guided projects (habit tracker, booking app, rescue a
  stalled app). Lessons carry a `kind`; the web and mobile maps show the path, kind icons and per-path progress.
- **Verification Lab isolation**: see `docs/VERIFICATION_SANDBOX.md`. Runtime verification remains unavailable
  (fails closed) until a real backend passes the probe suite.
- **Privacy**: self-service data export and account deletion requests with a 14-day cooling-off (web + mobile),
  admin queue, audited; erasure itself is an operator runbook (`docs/PRIVACY.md`).
- **Achievements** now include debugging cases, guided projects and completed paths (18 total).
- **Personalized onboarding** (web + mobile, shared copy in `@buildapps/core`): experience, goals, AI tools, intent,
  pace, project types, platforms and in-app reminder preference. The server builds a plan (path, focus lesson, project-first)
  and the dashboard adds a daily XP goal, a 7-day summary and a non-punitive comeback welcome.
- **Placement checks**: experienced learners can pass a server-graded 4-question check to skip a skill. Passing
  unlocks dependents only (`placed_out`); it grants no XP, level, achievement or streak, so mastery is never falsely
  awarded. Answers are rate-limited and failures reveal no solutions.

## Status after the product-experience pass

- **Curriculum**: 96 lessons / 320 exercises, 6 guided projects, 9 debugging cases, 24 skills. New tracks: AI coding
  workflows (instruction files, plan-first, permissions, context drift, prompt-to-app builders, AI editors, loops, git
  safety, hallucinated packages), mobile apps and store requirements, relationships/API design/background jobs/OAuth,
  privacy by design, permission testing, environments and monitoring. Tool names are used only as examples of tool
  categories; nothing claims integrations with them. Targets of 150 lessons / 750 exercises / 15 projects / 30 cases are
  not yet reached.
- **Project-linked learning**: every scanner rule has plain-language guidance, a corrective task, the matching lesson and
  a statement of what the rescan checks (`finding-guidance.ts`, tested for full rule coverage). Lessons opened from a
  finding return to the project (web + mobile). Locked lessons stay locked and say so; placement checks unlock them.
- **Design system**: `@buildapps/core` design tokens (colors, radius, motion) drive the mobile theme and are asserted
  against the web CSS and WCAG AA contrast. Original scene illustrations, empty/all-clear states and reward cards
  (reduced-motion aware); mobile adds reward cards and optional haptics (`expo-haptics`). Native haptics are unverified.
- Mobile Android and iOS bundles export successfully. That proves the JavaScript bundles build, not native behavior.
