# Privacy and account data

## What users can do (web and mobile, Help screen)

- **Export**: `GET /api/privacy/export` returns the caller's own progress, projects, help requests, support
  messages and notifications as JSON. Other people's data is never included. Each export is audited.
- **Delete**: `POST /api/privacy/deletion` with the typed phrase `DELETE MY ACCOUNT` records a request with a 14-day
  cooling-off period. The user can cancel with `DELETE /api/privacy/deletion` at any time before erasure.

## What admins can do

- List requests, and **record** an erasure after the cooling-off ends (`privacy.erasure_recorded` audit entry). The
  server refuses to record one earlier, even for an admin.

## Erasure runbook (operator action, not automated; requires explicit approval for each account)

1. Confirm the request is pending and `not_before` has passed; confirm no legal hold or open abuse report applies.
2. Delete the user with the Supabase Auth admin API (`auth.admin.deleteUser`). Foreign keys cascade learner data,
   projects, notifications, support requests and deletion requests; `admin_audit` keeps its rows with `actor_id` nulled.
3. Revoke any GitHub App installation row for the user (cascades with the user).
4. Record the erasure in the admin Privacy tab with a note describing what was done.

Erasure is deliberately not triggered by an API call: it is destructive and irreversible.
