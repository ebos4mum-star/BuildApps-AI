-- Batch 2: scans/findings, verification, expert handoffs, job milestones, server-only functions.
reset role;
insert into auth.users (id) values
  ('c0000000-0000-0000-0000-00000000000c'),  -- owner
  ('d0000000-0000-0000-0000-00000000000d'),  -- approved expert
  ('e0000000-0000-0000-0000-00000000000e'),  -- pending expert
  ('f0000000-0000-0000-0000-00000000000f');  -- unrelated user

set role service_role;
insert into public.projects (id, owner_id, name, journey, state) values
  ('c1000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 'Owner app', 'start', 'active'),
  ('c2000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-00000000000c', 'Other owner app', 'start', 'active');
insert into public.project_milestones (project_id, key, title) values ('c1000000-0000-0000-0000-0000000000a1', 'm1', 'M1');
insert into public.scans (id, project_id, requested_by, status) values
  ('5ca00000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 'complete');
insert into public.expert_profiles (id, user_id, display_name, status) values
  ('ee000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Dana', 'approved'),
  ('ee000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e', 'Pat', 'pending');
insert into public.service_requests (id, project_id, requester_id, summary, status, assigned_expert_id, matched_at) values
  ('aa000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 'please fix my broken build', 'matched', 'ee000000-0000-0000-0000-000000000001', now());
insert into public.job_milestones (service_request_id, title) values ('aa000000-0000-0000-0000-000000000001', 'Fix build');

-- ===== sync_findings semantics =====
do $$
declare r jsonb; p uuid := 'c1000000-0000-0000-0000-0000000000a1';
  s1 uuid := '5ca00000-0000-0000-0000-000000000001'; s2 uuid := '5ca00000-0000-0000-0000-000000000002'; s3 uuid := '5ca00000-0000-0000-0000-000000000003';
  f jsonb := '[{"rule_id":"r1","fingerprint":"fp1","kind":"verified","category":"build","severity":"high","title":"A","detail":"d","evidence":[{"path":"a"}],"milestone_key":"m1"},
               {"rule_id":"r2","fingerprint":"fp2","kind":"static_warning","category":"security","severity":"medium","title":"B","detail":"d"},
               {"rule_id":"r3","fingerprint":"fp3","kind":"recommendation","category":"docs","severity":"info","title":"C","detail":"d"}]';
begin
  r := public.sync_findings(p, s1, f);
  assert (r ->> 'new')::int = 3, 'three new findings: ' || r::text;
  assert (select count(*) from public.project_findings where project_id = p and status = 'open') = 3;

  -- user decisions: fp2 dismissed (decided), fp3 in progress
  update public.project_findings set status = 'dismissed', decided_by_user = true, resolution_source = 'user', status_note = 'accepted risk' where fingerprint = 'fp2';
  update public.project_findings set status = 'in_progress', decided_by_user = true where fingerprint = 'fp3';

  insert into public.scans (id, project_id, requested_by, status) values (s2, p, 'c0000000-0000-0000-0000-00000000000c', 'complete');
  -- rescan: fp1 persists, fp2 persists (dismissed stays), fp3 gone, fp4 new
  r := public.sync_findings(p, s2, ('[' || (f -> 0)::text || ',' || (f -> 1)::text || ',{"rule_id":"r4","fingerprint":"fp4","kind":"verified","category":"tests","severity":"low","title":"D","detail":"d"}]')::jsonb);
  assert (r ->> 'new')::int = 1 and (r ->> 'resolved')::int = 1, 'rescan counts: ' || r::text;
  assert (select status from public.project_findings where fingerprint = 'fp2') = 'dismissed', 'dismissal survives rescan';
  assert (select status_note from public.project_findings where fingerprint = 'fp2') = 'accepted risk';
  assert (select status || '/' || resolution_source from public.project_findings where fingerprint = 'fp3') = 'resolved/rescan', 'vanished finding resolved by rescan';
  assert (select status from public.project_findings where fingerprint = 'fp1') = 'open';

  -- regression: fp3 returns -> reopened (it was auto-resolved, not user-decided)
  insert into public.scans (id, project_id, requested_by, status) values (s3, p, 'c0000000-0000-0000-0000-00000000000c', 'complete');
  r := public.sync_findings(p, s3, f);
  assert (r ->> 'reopened')::int = 1, 'reopened regression: ' || r::text;
  assert (select status from public.project_findings where fingerprint = 'fp3') = 'open';
  assert (select status from public.project_findings where fingerprint = 'fp2') = 'dismissed', 'still dismissed after reappearing';
  assert (select count(*) from public.project_findings where project_id = p) = 4, 'no duplicate fingerprints';

  -- a user CLAIMS fp1 is fixed while the scan still sees it => reopened; claim on fp4 (really gone next scan) => confirmed
  update public.project_findings set status = 'resolved', resolution_source = 'user', decided_by_user = true where fingerprint in ('fp1', 'fp4');
  insert into public.scans (id, project_id, requested_by, status) values ('5ca00000-0000-0000-0000-000000000004', p, 'c0000000-0000-0000-0000-00000000000c', 'complete');
  r := public.sync_findings(p, '5ca00000-0000-0000-0000-000000000004', (f -> 0)::text::jsonb || '[]'::jsonb);
  assert (select status from public.project_findings where fingerprint = 'fp1') = 'open', 'user claim contradicted by scan => reopened';
  assert (select status || '/' || resolution_source from public.project_findings where fingerprint = 'fp4') = 'resolved/rescan', 'user claim confirmed by scan => rescan-resolved';
  assert (select remedy from public.project_findings where fingerprint = 'fp1') is not null;
end $$;

-- ===== server-only award_xp is idempotent =====
do $$
declare r jsonb; u uuid := 'c0000000-0000-0000-0000-00000000000c';
  a jsonb := '[{"award_key":"milestone:p:m1","source":"project_milestone","xp":100,"occurred_at":"2026-01-01T00:00:00Z"}]';
begin
  r := public.award_xp(u, a, array['first-verified-milestone']);
  assert (r ->> 'xp_added')::int = 100 and (r ->> 'total_xp')::int = 100, r::text;
  r := public.award_xp(u, a, array['first-verified-milestone']);
  assert (r ->> 'xp_added')::int = 0 and (r ->> 'total_xp')::int = 100, 'second award adds nothing: ' || r::text;
  assert (select count(*) from public.achievements_earned where user_id = u) = 1;
end $$;

-- ===== handoff constraints =====
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', array['view_findings'], now() + interval '31 days')$$, 'handoff > 30 days');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', array['view_source_code'], now() + interval '1 day')$$, 'unknown scope');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', '{}', now() + interval '1 day')$$, 'empty scopes');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', array['view_findings'], now() - interval '1 day')$$, 'already expired');
insert into public.project_handoffs (id, service_request_id, project_id, expert_id, scopes, expires_at) values
  ('bb000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000a1', 'ee000000-0000-0000-0000-000000000001', array['view_project','view_findings'], now() + interval '7 days');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', array['view_findings'], now() + interval '1 day')$$, 'second active handoff');
select pg_temp.expect_fail($$update public.service_requests set status = 'matched', assigned_expert_id = null where id = 'aa000000-0000-0000-0000-000000000001'$$, 'matched without expert');

-- ===== owner access & client write denial =====
reset role;
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 4, 'owner sees findings');
select pg_temp.expect_rows($$select 1 from public.scans$$, 4, 'owner sees scans');
select pg_temp.expect_rows($$select 1 from public.job_milestones$$, 1, 'requester sees job milestones');
select pg_temp.expect_rows($$select 1 from public.project_handoffs$$, 1, 'owner sees handoffs');
select pg_temp.expect_fail($$update public.project_findings set status = 'resolved'$$, 'client finding write');
select pg_temp.expect_fail($$insert into public.scans (project_id, requested_by, status) values ('c1000000-0000-0000-0000-0000000000a1', auth.uid(), 'complete')$$, 'client scan insert');
select pg_temp.expect_fail($$insert into public.verification_runs (project_id, requested_by, status) values ('c1000000-0000-0000-0000-0000000000a1', auth.uid(), 'complete')$$, 'client verification insert');
select pg_temp.expect_fail($$insert into public.github_installations (user_id, installation_id, account_login, account_type, repository_selection) values (auth.uid(), 1, 'x', 'User', 'all')$$, 'client installation insert');
select pg_temp.expect_fail($$insert into public.project_handoffs (service_request_id, project_id, expert_id, scopes, expires_at) values ('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-000000000001', array['view_findings'], now() + interval '1 day')$$, 'client handoff insert');
select pg_temp.expect_fail($$update public.service_requests set assigned_expert_id = 'ee000000-0000-0000-0000-000000000002'$$, 'client sets expert');
select pg_temp.expect_fail($$update public.service_requests set status = 'completed'$$, 'client completes request');
select pg_temp.expect_fail($$select * from public.admins$$, 'client reads admins');
select pg_temp.expect_fail($$insert into public.expert_profiles (user_id, display_name, status) values (auth.uid(), 'Me', 'approved')$$, 'client self-approves expert');
select pg_temp.expect_fail($$select public.award_xp(auth.uid(), '[]'::jsonb, null)$$, 'client calls award_xp');
select pg_temp.expect_fail($$select public.sync_findings('c1000000-0000-0000-0000-0000000000a1', '5ca00000-0000-0000-0000-000000000001', '[]')$$, 'client calls sync_findings');

-- ===== unrelated user sees nothing =====
reset role;
select pg_temp.act_as('f0000000-0000-0000-0000-00000000000f');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 0, 'stranger findings');
select pg_temp.expect_rows($$select 1 from public.projects$$, 0, 'stranger projects');
select pg_temp.expect_rows($$select 1 from public.job_milestones$$, 0, 'stranger jobs');
select pg_temp.expect_rows($$select 1 from public.service_requests$$, 0, 'stranger requests');

-- ===== approved expert: scoped, project-limited access =====
reset role;
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 4, 'expert sees findings (scope view_findings)');
select pg_temp.expect_rows($$select 1 from public.projects$$, 1, 'expert sees only the handed-off project');
select pg_temp.expect_rows($$select 1 from public.project_milestones$$, 1, 'expert sees milestones (view_project)');
select pg_temp.expect_rows($$select 1 from public.scans$$, 0, 'expert lacks view_scans');
select pg_temp.expect_rows($$select 1 from public.verification_runs$$, 0, 'expert lacks view_verification');
select pg_temp.expect_rows($$select 1 from public.job_milestones$$, 1, 'assigned expert sees job milestones');
select pg_temp.expect_rows($$select 1 from public.service_requests$$, 1, 'assigned expert sees request');
select pg_temp.expect_fail($$update public.project_findings set status = 'resolved'$$, 'expert cannot write findings');
select pg_temp.expect_no_effect($$update public.projects set name = 'pwned'$$, 'expert cannot edit project');
select pg_temp.expect_fail($$update public.job_milestones set status = 'accepted'$$, 'expert cannot self-accept deliverables');

-- ===== revoked / expired / suspended all cut access immediately =====
reset role; set role service_role;
update public.project_handoffs set expires_at = now() - interval '1 second', granted_at = now() - interval '1 day' where id = 'bb000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 0, 'expired handoff grants nothing');
select pg_temp.expect_rows($$select 1 from public.projects$$, 0, 'expired handoff hides project');

reset role; set role service_role;
update public.project_handoffs set expires_at = now() + interval '1 day', granted_at = now(), status = 'revoked', revoked_at = now() where id = 'bb000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 0, 'revoked handoff grants nothing');

reset role; set role service_role;
update public.project_handoffs set status = 'active', revoked_at = null where id = 'bb000000-0000-0000-0000-000000000001';
update public.expert_profiles set status = 'suspended' where id = 'ee000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 0, 'suspended expert loses access');

-- ===== pending (unapproved) expert never sees anything =====
reset role;
select pg_temp.act_as('e0000000-0000-0000-0000-00000000000e');
select pg_temp.expect_rows($$select 1 from public.project_findings$$, 0, 'pending expert sees nothing');
select pg_temp.expect_rows($$select 1 from public.expert_profiles$$, 1, 'expert sees own profile only');
reset role;
