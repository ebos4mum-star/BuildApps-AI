# Integration readiness

Everything below is **implemented and tested against fakes or local services**, and **none of it has been verified against a live
external service from this repository**. Nothing is activated by default. Use `pnpm check:env` (names only, no values) to see what
is configured. The admin Operations tab shows the same, labelled "configured (not verified live)".

| Integration         | Code ready                                                                                                                        | What you must do (owner actions)                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted Supabase     | Migrations in `supabase/migrations`, RLS tests, real local-Supabase integration tests in CI                                       | Create the project, `supabase db push`, set the three Supabase env vars (`docs/SUPABASE_SETUP.md`)                                           |
| GitHub App          | Read-only gateway, install flow with OAuth proof, scans, webhooks, fixtures                                                       | Register the App, set the App env vars, test with a throwaway repository (`docs/GITHUB_APP.md`)                                              |
| Push notifications  | Outbox, preferences, quiet hours, retries, dead-token cleanup, Expo adapter (mocked-network tests)                                | Expo/EAS account and project, push credentials (APNs/FCM), `expo-notifications` in the app, device registration UI. Set `PUSH_PROVIDER=expo` |
| Email notifications | Outbox + generic https webhook adapter                                                                                            | Pick a mail vendor, host a small relay that accepts the JSON and sends mail, set `EMAIL_WEBHOOK_*`                                           |
| Scheduler           | `POST /api/internal/dispatch` (bearer `CRON_SECRET`): reminders, weekly summaries, outbox delivery; idempotent                    | Schedule it every 5-15 minutes (hosting cron, or Supabase pg_cron + pg_net) with the secret                                                  |
| Verification Lab    | Isolation contract, hardened container spec, probe suite, fail-closed gate (`docs/VERIFICATION_SANDBOX.md`)                       | Provision isolated infrastructure (gVisor/microVM), implement a backend, prove it, get approval                                              |
| Account erasure     | Auditable executor (cooling-off, typed id, admin-only, never admins or accounts with expert work); verified on synthetic accounts | Set `ALLOW_ACCOUNT_ERASURE=1` only for an approved operation; confirm legal/store requirements first                                         |
| App Store / Play    | Publishing Center tracks readiness, releases and review outcomes; submits nothing                                                 | Developer accounts, listing assets, your own submission                                                                                      |

## Activating notifications safely

1. Deploy with `CRON_SECRET` set; call the endpoint once by hand and read the JSON report.
2. Configure ONE provider, send yourself a message with a test account, and check the Operations tab queue counters.
3. Turn on the scheduler. Users stay opted out (push and email default off) until they choose in Settings.
4. Account-safety messages (`security`) are always delivered in-app and ignore quiet hours; everything else obeys preferences.
