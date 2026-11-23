# Dedicated Supabase project: setup

Nothing here has been done for you. Creating the project, keys and hosting is an owner action
(Supabase free tier is enough to start; check your plan before enabling paid add-ons).

## 1. Create the project (owner action)
1. supabase.com -> New project (dedicated to BuildApps AI). Pick a region near your users and set a strong DB password (store it in your password manager, not in the repo).
2. Settings -> API: note **Project URL**, **anon/publishable key** (public) and **service_role/secret key** (server-only; full access, bypasses RLS).

## 2. Apply the schema
```
npm i -g supabase            # or use npx
supabase login
supabase link --project-ref <your-project-ref>
supabase db push             # applies supabase/migrations/*.sql in order
```
Review the SQL first. It is additive; nothing is dropped. Re-run `pnpm test:db` locally before pushing.

## 3. Auth settings (Dashboard -> Authentication)
- Providers: Email enabled. Turn **Confirm email ON** for production.
- URL configuration: Site URL = your web origin; add `https://<your-web-origin>/**` and, for the mobile app, `buildapps://**` as redirect URLs.
- Password policy: min length 8+ (the apps already require 8).
- Leave "Allow new users to sign up" on unless you want invite-only.

## 4. Environment variables
| Variable | Where | Secret? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web host | no | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web host | no | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | web host **server env only** | **YES** | never prefix with `NEXT_PUBLIC_`/`EXPO_PUBLIC_`; never commit |
| `EXPO_PUBLIC_SUPABASE_URL` | mobile build | no | same URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile build | no | same anon key |
| `EXPO_PUBLIC_API_URL` | mobile build | no | base URL of the deployed web app (hosts `/api`) |

`DEV_MEMORY_BACKEND` and `NEXT_PUBLIC_DEV_BACKEND` must be **unset** in production (the server refuses to boot with the former when `NODE_ENV=production`).

## 5. Verify
- Local, with Docker: `supabase start`, then export the printed API URL/keys as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and run `pnpm --filter @buildapps/server test:integration`. CI runs the same against a local Supabase on every push.
- Never point the integration tests at a cloud project: they create and delete users.

## 6. Rotation / incident
If the service role key leaks: Settings -> API -> reset/rotate keys, update the web host env, redeploy. Rotate the DB password separately if it was exposed.
