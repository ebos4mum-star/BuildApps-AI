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
