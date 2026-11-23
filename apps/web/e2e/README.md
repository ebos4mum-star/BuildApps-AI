# Browser end-to-end test (local, no Supabase required)

Plays every lesson through the real UI (click/tap alternatives to drag-and-drop), checks that the
server rejects forged/locked requests, and exercises the Start/Continue/Rescue journeys.

```
cd apps/web
DEV_MEMORY_BACKEND=1 NEXT_PUBLIC_DEV_BACKEND=1 npx next dev -p 3100 &   # in-memory dev backend
npx tsx e2e/dump-solutions.ts /tmp/solutions.json                        # exports solutions for the player
node e2e/play-all-lessons.js /tmp                                        # needs `playwright` installed
```

`DEV_MEMORY_BACKEND` is refused when `NODE_ENV=production`.

## Stage 3-5 journey (`batch2-flows.js`)

Three users (owner, expert, admin) in separate browser contexts: GitHub connect/link/scan, finding decisions,
rescan reopen/keep, verification (runtime verification shown as unavailable), expert vetting, manual match,
scoped handoff, revision + resubmission, completion, disconnect. Needs a fresh dev server:

```
node e2e/batch2-flows.js /tmp
```
