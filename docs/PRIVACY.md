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

The executor (`POST /api/admin/privacy/deletions/:id/execute`, also in the admin Privacy tab) performs steps 2-3 for you,
but is disabled unless the operator sets `ALLOW_ACCOUNT_ERASURE=1`. It refuses before the cooling-off ends, requires the
account id to be typed exactly, never erases administrators, refuses accounts with expert work in progress and writes the
audit entry before erasing. Audit rows keep their content, with the erased actor removed. `target_id` columns hold an
opaque id and are retained for integrity. Erasure is irreversible: use it only for approved requests, and confirm legal and
store requirements first. Never run it against real accounts during development; tests use synthetic accounts only.
