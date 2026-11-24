-- Stage 9: admin operations tables, audit immutability, client isolation.
reset role;
insert into auth.users (id) values
  ('91000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000002');
set role service_role;
insert into public.support_requests (id, user_id, category, subject, body)
  values ('9a000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 'account', 'Cannot sign in', 'I cannot sign in on my phone since yesterday.');
insert into public.abuse_reports (reporter_id, target_type, target_id, reason)
  values ('91000000-0000-0000-0000-000000000001', 'expert', 'e-1', 'spam');
insert into public.notifications (user_id, kind, title, link)
  values ('91000000-0000-0000-0000-000000000001', 'support', 'Reply from support', '/support');
insert into public.admin_audit (actor_id, action, target_type, target_id) values (null, 'user.suspend', 'user', 'x');
insert into public.account_status (user_id, suspended, reason) values ('92000000-0000-0000-0000-000000000002', true, 'abuse');

select pg_temp.expect_fail($$insert into public.support_requests (user_id, category, subject, body) values ('91000000-0000-0000-0000-000000000001', 'billing', 'Hello there', 'A category that is not allowed here.')$$, 'unknown support category');
select pg_temp.expect_fail($$insert into public.support_requests (user_id, category, subject, body) values ('91000000-0000-0000-0000-000000000001', 'other', 'Hi', 'too short subject but body is fine')$$, 'subject too short');
select pg_temp.expect_fail($$insert into public.abuse_reports (reporter_id, target_type, target_id, reason) values ('91000000-0000-0000-0000-000000000001', 'planet', 'x', 'spam')$$, 'unknown report target');
select pg_temp.expect_fail($$insert into public.notifications (user_id, kind, title, link) values ('91000000-0000-0000-0000-000000000001', 'x', 'Hi', 'https://evil.example')$$, 'notification link must be a relative path');
select pg_temp.expect_fail($$update public.admin_audit set action = 'tampered'$$, 'audit rows cannot be edited');
select pg_temp.expect_fail($$delete from public.admin_audit$$, 'audit rows cannot be deleted');

-- a user sees only their own support requests, reports and notifications; nothing else exists for them
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false);
select pg_temp.expect_rows($$select 1 from public.support_requests$$, 1, 'owner sees own support request');
select pg_temp.expect_rows($$select 1 from public.abuse_reports$$, 1, 'owner sees own report');
select pg_temp.expect_rows($$select 1 from public.notifications$$, 1, 'owner sees own notification');
select pg_temp.expect_fail($$select 1 from public.admin_audit$$, 'users cannot read the audit log');
select pg_temp.expect_fail($$select 1 from public.account_status$$, 'users cannot read account status');
select pg_temp.expect_fail($$select 1 from public.content_flags$$, 'users cannot read content flags');
select pg_temp.expect_fail($$insert into public.support_requests (user_id, category, subject, body) values ('91000000-0000-0000-0000-000000000001', 'other', 'Direct write', 'Clients must not write this table directly.')$$, 'clients cannot insert support requests');
select pg_temp.expect_fail($$update public.notifications set read_at = now()$$, 'clients cannot update notifications');
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000002', false);
select pg_temp.expect_rows($$select 1 from public.support_requests$$, 0, 'strangers see no support requests');
select pg_temp.expect_rows($$select 1 from public.notifications$$, 0, 'strangers see no notifications');
reset role;

-- Privacy: deletion requests
reset role;
set role service_role;
insert into public.deletion_requests (user_id, not_before)
  values ('91000000-0000-0000-0000-000000000001', now() + interval '14 days');
select pg_temp.expect_fail($$insert into public.deletion_requests (user_id, not_before) values ('91000000-0000-0000-0000-000000000001', now() + interval '14 days')$$, 'only one pending deletion request per user');
select pg_temp.expect_fail($$insert into public.deletion_requests (user_id, status, not_before) values ('92000000-0000-0000-0000-000000000002', 'done', now())$$, 'unknown deletion status');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false);
select pg_temp.expect_rows($$select 1 from public.deletion_requests$$, 1, 'owner sees own deletion request');
select pg_temp.expect_fail($$update public.deletion_requests set status = 'cancelled'$$, 'clients cannot change deletion requests');
select pg_temp.expect_fail($$insert into public.deletion_requests (user_id, not_before) values ('91000000-0000-0000-0000-000000000001', now())$$, 'clients cannot create deletion requests directly');
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000002', false);
select pg_temp.expect_rows($$select 1 from public.deletion_requests$$, 0, 'strangers see no deletion requests');
reset role;

-- Learner profiles
reset role;
set role service_role;
insert into public.learner_profiles (user_id, experience, goals, tools, intent, pace)
  values ('91000000-0000-0000-0000-000000000001', 'some', '{ship_first_app}', '{cursor}', 'start', 'steady');
select pg_temp.expect_fail($$insert into public.learner_profiles (user_id, experience, goals, tools, intent, pace) values ('92000000-0000-0000-0000-000000000002', 'guru', '{a}', '{b}', 'start', 'steady')$$, 'unknown experience level');
select pg_temp.expect_fail($$insert into public.learner_profiles (user_id, experience, goals, tools, intent, pace, reminder_hour) values ('92000000-0000-0000-0000-000000000002', 'new', '{a}', '{b}', 'start', 'steady', 30)$$, 'reminder hour out of range');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false);
select pg_temp.expect_rows($$select 1 from public.learner_profiles$$, 1, 'owner sees own profile');
select pg_temp.expect_fail($$update public.learner_profiles set placed_out = '{backend}'$$, 'clients cannot grant themselves placement');
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000002', false);
select pg_temp.expect_rows($$select 1 from public.learner_profiles$$, 0, 'strangers see no profiles');
reset role;
