-- Stage 6: publishing schema, RLS, state-machine guards, audit trail.
reset role;
insert into auth.users (id) values
  ('71000000-0000-0000-0000-000000000001'),  -- owner
  ('72000000-0000-0000-0000-000000000002'),  -- expert (approved)
  ('73000000-0000-0000-0000-000000000003');  -- stranger
set role service_role;
insert into public.projects (id, owner_id, name, journey, state) values
  ('7a000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-000000000001', 'Pub app', 'start', 'active');
insert into public.publish_targets (id, project_id, platform, metadata) values
  ('7b000000-0000-0000-0000-00000000000b', '7a000000-0000-0000-0000-00000000000a', 'apple_app_store', '{"appName":"Pub"}');
insert into public.publish_claims (target_id, requirement_key, kind, note) values
  ('7b000000-0000-0000-0000-00000000000b', 'apple.signing', 'self_reported', 'certificates created in my account');
insert into public.publish_releases (id, target_id, version) values ('7c000000-0000-0000-0000-00000000000c', '7b000000-0000-0000-0000-00000000000b', '1.0.0');

-- ===== constraints =====
select pg_temp.expect_fail($$insert into public.publish_targets (project_id, platform) values ('7a000000-0000-0000-0000-00000000000a', 'steam')$$, 'unknown platform');
select pg_temp.expect_fail($$insert into public.publish_targets (project_id, platform) values ('7a000000-0000-0000-0000-00000000000a', 'apple_app_store')$$, 'duplicate target');
select pg_temp.expect_fail($$insert into public.publish_releases (target_id, version) values ('7b000000-0000-0000-0000-00000000000b', 'v1')$$, 'bad version');
select pg_temp.expect_fail($$insert into public.publish_releases (target_id, version) values ('7b000000-0000-0000-0000-00000000000b', '1.0.0')$$, 'duplicate version');
select pg_temp.expect_fail($$insert into public.publish_claims (target_id, requirement_key, kind, note) values ('7b000000-0000-0000-0000-00000000000b', 'x', 'verified', 'a claim can never be verified')$$, 'claim cannot be verified');
select pg_temp.expect_fail($$insert into public.publish_claims (target_id, requirement_key, kind, note) values ('7b000000-0000-0000-0000-00000000000b', 'x', 'self_reported', 'no')$$, 'claim needs a real note');
select pg_temp.expect_fail($$insert into public.publish_events (project_id, actor_role, action) values ('7a000000-0000-0000-0000-00000000000a', 'ghost', 'x')$$, 'invalid event role');

-- ===== release state machine enforced by the database =====
select pg_temp.expect_fail($$update public.publish_releases set status = 'submitted' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'draft -> submitted skips readiness');
select pg_temp.expect_fail($$update public.publish_releases set status = 'approved' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'draft -> approved');
update public.publish_releases set status = 'ready' where id = '7c000000-0000-0000-0000-00000000000c';
-- 'submitted' needs a recorded submission by the time the transaction commits (deferred constraint)
do $$ begin
  update public.publish_releases set status = 'submitted' where id = '7c000000-0000-0000-0000-00000000000c';
  set constraints all immediate; -- the rule is deferred to commit; force it now
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: submitted without any recorded submission';
exception when check_violation then null;
end $$;
insert into public.publish_submissions (id, release_id, attempt_number) values ('7d000000-0000-0000-0000-00000000000d', '7c000000-0000-0000-0000-00000000000c', 1);
update public.publish_releases set status = 'submitted' where id = '7c000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$insert into public.publish_submissions (release_id, attempt_number) values ('7c000000-0000-0000-0000-00000000000c', 2)$$, 'two active submissions for one release');
select pg_temp.expect_fail($$update public.publish_releases set status = 'released' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'submitted -> released');
update public.publish_releases set status = 'rejected' where id = '7c000000-0000-0000-0000-00000000000c';
update public.publish_submissions set status = 'rejected', decided_at = now() where id = '7d000000-0000-0000-0000-00000000000d';
select pg_temp.expect_fail($$update public.publish_releases set status = 'approved' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'rejected -> approved without resubmitting');
-- resubmission: a NEW attempt on the same release
insert into public.publish_submissions (release_id, attempt_number) values ('7c000000-0000-0000-0000-00000000000c', 2);
update public.publish_releases set status = 'submitted' where id = '7c000000-0000-0000-0000-00000000000c';
update public.publish_releases set status = 'approved' where id = '7c000000-0000-0000-0000-00000000000c';
update public.publish_releases set status = 'released' where id = '7c000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$update public.publish_releases set status = 'rejected' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'released is terminal');
select pg_temp.expect_fail($$update public.publish_releases set status = 'withdrawn' where id = '7c000000-0000-0000-0000-00000000000c'$$, 'released cannot be withdrawn');

-- ===== audit trail is immutable, even for the server role =====
insert into public.publish_events (project_id, target_id, actor_id, actor_role, action, detail) values
  ('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-000000000001', 'owner', 'target_added', '{}');
select pg_temp.expect_fail($$update public.publish_events set action = 'tampered'$$, 'publish events are immutable');

-- ===== handoff scope for publishing + service request kind =====
insert into public.expert_profiles (id, user_id, display_name, status) values ('7e000000-0000-0000-0000-00000000000e', '72000000-0000-0000-0000-000000000002', 'Pia', 'approved');
insert into public.service_requests (id, project_id, requester_id, summary, status, assigned_expert_id, matched_at, kind, publish_target_id) values
  ('7f000000-0000-0000-0000-00000000000f', '7a000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-000000000001', 'please help me publish my app', 'matched', '7e000000-0000-0000-0000-00000000000e', now(), 'publishing', '7b000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail($$insert into public.service_requests (project_id, requester_id, summary, kind) values ('7a000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-000000000001', 'please help me publish my app', 'consulting')$$, 'unknown request kind');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('7f000000-0000-0000-0000-00000000000f','7a000000-0000-0000-0000-00000000000a','7e000000-0000-0000-0000-00000000000e', array['view_store_credentials'], now() + interval '1 day')$$, 'unknown scope still rejected');

-- ===== owner sees everything; clients never write; strangers see nothing =====
reset role;
select pg_temp.act_as('71000000-0000-0000-0000-000000000001');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 1, 'owner sees target');
select pg_temp.expect_rows($$select 1 from public.publish_claims$$, 1, 'owner sees claims');
select pg_temp.expect_rows($$select 1 from public.publish_releases$$, 1, 'owner sees releases');
select pg_temp.expect_rows($$select 1 from public.publish_submissions$$, 2, 'owner sees submissions');
select pg_temp.expect_rows($$select 1 from public.publish_events$$, 1, 'owner sees events');
select pg_temp.expect_fail($$insert into public.publish_targets (project_id, platform) values ('7a000000-0000-0000-0000-00000000000a', 'web')$$, 'client target insert');
select pg_temp.expect_fail($$insert into public.publish_claims (target_id, requirement_key, kind, note) values ('7b000000-0000-0000-0000-00000000000b','x','self_reported','client forged claim')$$, 'client claim insert');
select pg_temp.expect_fail($$update public.publish_releases set status = 'approved'$$, 'client cannot approve a release');
select pg_temp.expect_fail($$insert into public.publish_submissions (release_id, attempt_number) values ('7c000000-0000-0000-0000-00000000000c', 9)$$, 'client submission insert');
select pg_temp.expect_fail($$insert into public.publish_feedback (submission_id, outcome, reason_category, message) values ('7d000000-0000-0000-0000-00000000000d','approved','other','forged approval')$$, 'client feedback insert');
select pg_temp.expect_fail($$insert into public.publish_events (project_id, actor_role, action) values ('7a000000-0000-0000-0000-00000000000a','owner','forged')$$, 'client event insert');
reset role;
select pg_temp.act_as('73000000-0000-0000-0000-000000000003');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 0, 'stranger targets');
select pg_temp.expect_rows($$select 1 from public.publish_releases$$, 0, 'stranger releases');
select pg_temp.expect_rows($$select 1 from public.publish_events$$, 0, 'stranger events');
select pg_temp.expect_rows($$select 1 from public.publish_claims$$, 0, 'stranger claims');
reset role;

-- ===== expert: only with an active, unexpired view_publishing handoff =====
select pg_temp.act_as('72000000-0000-0000-0000-000000000002');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 0, 'expert without handoff sees nothing');
reset role; set role service_role;
insert into public.project_handoffs (id, service_request_id, project_id, expert_id, scopes, expires_at) values
  ('7a100000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-00000000000f', '7a000000-0000-0000-0000-00000000000a', '7e000000-0000-0000-0000-00000000000e', array['view_findings'], now() + interval '3 days');
reset role;
select pg_temp.act_as('72000000-0000-0000-0000-000000000002');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 0, 'other scopes do not expose publishing');
reset role; set role service_role;
update public.project_handoffs set scopes = array['view_publishing'] where id = '7a100000-0000-0000-0000-000000000001';
reset role;
select pg_temp.act_as('72000000-0000-0000-0000-000000000002');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 1, 'view_publishing exposes targets');
select pg_temp.expect_rows($$select 1 from public.publish_releases$$, 1, 'view_publishing exposes releases');
select pg_temp.expect_rows($$select 1 from public.publish_claims$$, 1, 'view_publishing exposes claims');
select pg_temp.expect_rows($$select 1 from public.publish_events$$, 1, 'view_publishing exposes events');
select pg_temp.expect_fail($$update public.publish_releases set status = 'draft'$$, 'expert cannot write releases');
reset role; set role service_role;
update public.project_handoffs set status = 'revoked', revoked_at = now() where id = '7a100000-0000-0000-0000-000000000001';
reset role;
select pg_temp.act_as('72000000-0000-0000-0000-000000000002');
select pg_temp.expect_rows($$select 1 from public.publish_targets$$, 0, 'revoked handoff closes publishing access');
reset role;
