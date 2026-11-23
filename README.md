# BuildApps AI

Duolingo-style learning and project-completion platform for people building apps with AI.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

Node 22+, pnpm 10 (`corepack enable`). Docker is optional (local Supabase, from Milestone 4).

## Commands

```
pnpm install
pnpm check        # format, lint, typecheck, test
```

Copy `.env.example` to `.env.local`; never commit secrets.
