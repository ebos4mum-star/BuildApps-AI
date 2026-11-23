-- Supabase grants anon/authenticated/service_role full access to every NEW object in `public` by
-- default. Revoke that for client roles so a future table is invisible to clients until a migration
-- explicitly grants SELECT (plus RLS policies). service_role keeps its defaults.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
