# BuildApps AI

Duolingo-style learning and project-completion platform for people building apps with AI.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What works today (Batch 1)

- **Learn by Doing**: 9 lessons / 34 interactive exercises (sequencing, bug hunts, layer matching,
  AI-project scenarios, word banks), XP, streaks, skill progression, achievements.
- **Projects**: Start / Continue / Rescue journeys, milestones, self-reported vs verified progress,
  rescue recovery stages, human-help requests (queued for manual matching).
- Web (Next.js) and mobile (Expo) share one account, one API and one progress history.
- Not built yet: Rescue Scanner, Verification Lab, expert matching/payments, Publishing Center billing.

## Requirements

Node 22+, pnpm 10 (`corepack enable`). Docker is optional (local Supabase).

## Commands

```
pnpm install
pnpm check       # format, lint, typecheck, unit tests
pnpm test:db     # migrations + RLS tests against a throwaway Postgres (or DATABASE_URL)
```

## Run the web app without Supabase (local dev only)

```
cd apps/web
DEV_MEMORY_BACKEND=1 NEXT_PUBLIC_DEV_BACKEND=1 npx next dev
```

In-memory data, "dev:<name>" tokens. The server refuses this mode when `NODE_ENV=production`.
Browser end-to-end test: see `apps/web/e2e/README.md`.

## Run with local Supabase (needs Docker)

```
supabase start                        # applies supabase/migrations
cp .env.example apps/web/.env.local   # fill URL/keys printed by `supabase start`
cd apps/web && npx next dev
```

## Mobile

```
cd apps/mobile && cp .env.example .env   # point EXPO_PUBLIC_API_URL at the web app
npx expo start
```

`pnpm --filter @buildapps/mobile bundle:check` verifies the JS bundle builds.

Never commit secrets; copy `.env.example` and keep real values out of Git.
