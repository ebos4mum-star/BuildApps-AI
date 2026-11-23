\set ON_ERROR_STOP on
\o /dev/null
-- helpers
create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return; -- denied, as intended
  end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', label;
end $$;
create function pg_temp.expect_rows(sql text, n int, label text) returns void language plpgsql as $$
declare c int;
begin
  execute 'select count(*) from (' || sql || ') q' into c;
  if c <> n then raise exception 'ROW COUNT MISMATCH for %: expected %, got %', label, n, c; end if;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"display_name":"Alice"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', null);

-- signup trigger created profile + progress
select pg_temp.expect_rows($$select 1 from public.profiles$$, 2, 'profiles created');
select pg_temp.expect_rows($$select 1 from public.user_progress$$, 2, 'progress created');

-- server (service_role) seeds a project for each user
set role service_role;
insert into public.projects (id, owner_id, name, journey, state) values
  ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A app', 'start', 'active'),
  ('22222222-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'B app', 'start', 'active');
insert into public.project_milestones (project_id, key, title) values
  ('11111111-0000-0000-0000-00000000000a', 'm1', 'M1'),
  ('22222222-0000-0000-0000-00000000000b', 'm1', 'M1');

-- === isolation: Alice sees only her rows ===
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_rows($$select 1 from public.projects$$, 1, 'alice sees 1 project');
select pg_temp.expect_rows($$select 1 from public.project_milestones$$, 1, 'alice sees 1 milestone');
select pg_temp.expect_rows($$select 1 from public.profiles$$, 1, 'alice sees own profile');
select pg_temp.expect_rows($$select 1 from public.user_progress$$, 1, 'alice sees own progress');

-- === clients cannot forge progression ===
select pg_temp.expect_fail($$insert into public.xp_awards (user_id, award_key, source, xp, occurred_at) values (auth.uid(), 'x', 'exercise', 999, now())$$, 'client xp insert');
select pg_temp.expect_fail($$update public.user_progress set total_xp = 99999$$, 'client progress update');
select pg_temp.expect_fail($$insert into public.challenge_attempts (user_id, exercise_id, attempt_number, passed) values (auth.uid(), 'e', 1, true)$$, 'client attempt insert');
select pg_temp.expect_fail($$insert into public.exercise_completions (user_id, exercise_id) values (auth.uid(), 'e')$$, 'client completion insert');
select pg_temp.expect_fail($$insert into public.achievements_earned (user_id, achievement_id) values (auth.uid(), 'a')$$, 'client achievement insert');
select pg_temp.expect_fail($$insert into public.entitlements (user_id, kind, status, source) values (auth.uid(), 'publishing_assistance', 'active', 'web')$$, 'client entitlement insert');
select pg_temp.expect_fail($$update public.project_milestones set status='done', completion_source='verified', evidence_ref='x'$$, 'client milestone verify');
select pg_temp.expect_fail($$insert into public.projects (owner_id, name, journey) values (auth.uid(), 'x', 'start')$$, 'client project insert (server-only)');
select pg_temp.expect_fail($$select public.apply_attempt(auth.uid(), 'e', true, 0, '[]'::jsonb, null, null)$$, 'client calling apply_attempt');

-- === allowed edits are column-limited ===
update public.projects set name = 'Renamed' where id = '11111111-0000-0000-0000-00000000000a';
select pg_temp.expect_fail($$update public.projects set state = 'completed'$$, 'client state change');
select pg_temp.expect_fail($$update public.projects set owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, 'client owner change');
update public.profiles set display_name = 'Al', timezone = 'Europe/London';
select pg_temp.expect_fail($$update public.profiles set timezone = 'Mars/Base'$$, 'invalid timezone');

-- cross-user writes affect zero rows
update public.projects set name = 'Hacked' where id = '22222222-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$insert into public.service_requests (project_id, requester_id, summary) values ('22222222-0000-0000-0000-00000000000b', auth.uid(), 'please help with this project')$$, 'request on others project');
insert into public.service_requests (project_id, requester_id, summary) values ('11111111-0000-0000-0000-00000000000a', auth.uid(), 'please help rescue this project');
select pg_temp.expect_fail($$insert into public.service_requests (project_id, requester_id, summary, status) values ('11111111-0000-0000-0000-00000000000a', auth.uid(), 'please help rescue this project', 'verified')$$, 'client sets request status');

-- === Bob cannot see Alice's data (and vice versa) ===
reset role;
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_rows($$select 1 from public.projects where name = 'Hacked' or name = 'Renamed'$$, 0, 'bob cannot see/alter alice project');
select pg_temp.expect_rows($$select 1 from public.service_requests$$, 0, 'bob sees no requests');

-- === anon sees nothing ===
reset role; set role anon;
select pg_temp.expect_fail($$select * from public.projects$$, 'anon select');

-- === apply_attempt: idempotent XP, optimistic concurrency ===
reset role; set role service_role;
do $$
declare r jsonb; u uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  award jsonb := '[{"award_key":"exercise:e1","source":"exercise","xp":25,"occurred_at":"2026-01-01T10:00:00Z"}]';
begin
  r := public.apply_attempt(u, 'e1', true, 0, award, array['first-exercise'], '{"current":1,"longest":1,"last_active_day":"2026-01-01","rest_days_available":1}');
  assert r ->> 'status' = 'ok' and (r ->> 'total_xp')::int = 25 and (r ->> 'xp_added')::int = 25, 'first award: ' || r::text;

  -- stale version => conflict, nothing written
  r := public.apply_attempt(u, 'e1', true, 0, award, null, null);
  assert r ->> 'status' = 'conflict', 'stale version must conflict';

  -- replay of the same award with correct version: attempt logged, XP NOT doubled
  r := public.apply_attempt(u, 'e1', true, 1, award, null, null);
  assert r ->> 'status' = 'ok' and (r ->> 'xp_added')::int = 0 and (r ->> 'total_xp')::int = 25, 'duplicate award must add 0: ' || r::text;

  assert (select count(*) from public.xp_awards where user_id = u) = 1, 'one xp row';
  assert (select count(*) from public.challenge_attempts where user_id = u) = 2, 'both attempts logged';
  assert (select max(attempt_number) from public.challenge_attempts where user_id = u) = 2, 'attempt numbers increment';
  assert (select count(*) from public.exercise_completions where user_id = u) = 1, 'one completion';
  assert (select longest_streak from public.user_progress where user_id = u) = 1, 'streak persisted';
  assert (select version from public.user_progress where user_id = u) = 2, 'version bumped';

  -- failed attempt records but awards nothing and never lowers longest streak
  r := public.apply_attempt(u, 'e2', false, 2, '[]', null, '{"current":0,"longest":0}');
  assert (select longest_streak from public.user_progress where user_id = u) = 1, 'longest never decreases';
end $$;

-- DB constraints protect integrity even from the server
select pg_temp.expect_fail($$insert into public.project_milestones (project_id, key, title, status, completion_source) values ('11111111-0000-0000-0000-00000000000a','bad','Bad','done','verified')$$, 'verified without evidence');
select pg_temp.expect_fail($$insert into public.projects (owner_id, name, journey) values ('aaaaaaaa-0000-0000-0000-000000000001','r','rescue')$$, 'rescue without repo/recovery');
select pg_temp.expect_fail($$insert into public.xp_awards (user_id, award_key, source, xp, occurred_at) values ('aaaaaaaa-0000-0000-0000-000000000001','exercise:e1','exercise',5,now())$$, 'duplicate award key');

\o
\echo ALL DB TESTS PASSED
