-- Batch 2: GitHub connection, scanner findings, verification evidence, expert rescue.
-- Same rules as the core schema: RLS everywhere, clients SELECT only, server (service_role) writes.
-- NO secrets are stored here: GitHub installation tokens are minted on demand from the App key
-- (server env) and never persisted. No payment data exists in V1.

-- ---------- GitHub App connections ----------
create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  created_at timestamptz not null default now(),
  unique (user_id, installation_id)
);
alter table public.projects add column github_installation_id uuid references public.github_installations (id) on delete set null;

-- ---------- scans & findings ----------
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  commit_sha text,
  ref text,
  status text not null check (status in ('running', 'complete', 'failed')),
  stats jsonb not null default '{}',
  assessment jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index scans_project_idx on public.scans (project_id, created_at desc);

create table public.project_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  rule_id text not null,
  fingerprint text not null,
  /* verified = observed directly in repository files; static_warning = heuristic; recommendation = unverified advice */
  kind text not null check (kind in ('verified', 'static_warning', 'recommendation')),
  category text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title text not null,
  detail text not null,
  remedy text not null default '',
  evidence jsonb not null default '[]',
  milestone_key text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  status_note text check (char_length(status_note) <= 1000),
  /* user decisions (dismissed / in progress) survive rescans */
  decided_by_user boolean not null default false,
  resolution_source text check (resolution_source in ('user', 'rescan', 'verification')),
  first_seen_scan uuid references public.scans (id) on delete set null,
  last_seen_scan uuid references public.scans (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);
create index findings_project_idx on public.project_findings (project_id, status);

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  commit_sha text,
  status text not null check (status in ('complete', 'failed')),
  /* [{id,title,status:pass|fail|skipped|unavailable,source:static|ci_checks,evidence:{}}] */
  checks jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index verification_runs_project_idx on public.verification_runs (project_id, created_at desc);

-- ---------- Human Developer Rescue ----------
create table public.admins (user_id uuid primary key references auth.users (id) on delete cascade);

create table public.expert_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 2000),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.service_requests
  add column assigned_expert_id uuid references public.expert_profiles (id),
  add column matched_at timestamptz,
  add column completed_at timestamptz,
  add column completion_evidence jsonb;
alter table public.service_requests drop constraint service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('submitted', 'matched', 'in_progress', 'delivered', 'completed', 'cancelled'));
alter table public.service_requests add constraint matched_has_expert
  check (status in ('submitted', 'cancelled') or assigned_expert_id is not null);

create table public.project_handoffs (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  expert_id uuid not null references public.expert_profiles (id),
  scopes text[] not null
    check (cardinality(scopes) >= 1 and scopes <@ array['view_project', 'view_scans', 'view_findings', 'view_verification']),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint handoff_max_30_days check (expires_at > granted_at and expires_at <= granted_at + interval '30 days')
);
create unique index one_active_handoff_per_request on public.project_handoffs (service_request_id) where status = 'active';

create table public.job_milestones (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 1000),
  position integer not null default 0,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'submitted', 'accepted', 'rejected')),
  deliverable_note text check (char_length(deliverable_note) <= 2000),
  deliverable_url text check (deliverable_url ~ '^https://'),
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------- expert access helper (RLS) ----------
-- True when the caller is an APPROVED expert with an ACTIVE, UNEXPIRED handoff granting `p_scope`.
create function public.expert_can(p_project uuid, p_scope text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_handoffs h
    join public.expert_profiles e on e.id = h.expert_id
    where h.project_id = p_project and e.user_id = auth.uid() and e.status = 'approved'
      and h.status = 'active' and h.expires_at > now() and p_scope = any (h.scopes)
  )
$$;
revoke all on function public.expert_can(uuid, text) from public, anon;
grant execute on function public.expert_can(uuid, text) to authenticated, service_role;

create function public.is_assigned_expert(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_requests r join public.expert_profiles e on e.id = r.assigned_expert_id
    where r.id = p_request and e.user_id = auth.uid() and e.status = 'approved'
  )
$$;
revoke all on function public.is_assigned_expert(uuid) from public, anon;
grant execute on function public.is_assigned_expert(uuid) to authenticated, service_role;

-- ---------- RLS ----------
alter table public.github_installations enable row level security;
alter table public.scans enable row level security;
alter table public.project_findings enable row level security;
alter table public.verification_runs enable row level security;
alter table public.admins enable row level security;
alter table public.expert_profiles enable row level security;
alter table public.project_handoffs enable row level security;
alter table public.job_milestones enable row level security;


create policy installs_select on public.github_installations for select to authenticated using (user_id = auth.uid());
create policy scans_owner on public.scans for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy scans_expert on public.scans for select to authenticated using (public.expert_can(project_id, 'view_scans'));
create policy findings_owner on public.project_findings for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy findings_expert on public.project_findings for select to authenticated using (public.expert_can(project_id, 'view_findings'));
create policy vruns_owner on public.verification_runs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy vruns_expert on public.verification_runs for select to authenticated using (public.expert_can(project_id, 'view_verification'));
create policy projects_expert on public.projects for select to authenticated using (public.expert_can(id, 'view_project'));
create policy milestones_expert on public.project_milestones for select to authenticated using (public.expert_can(project_id, 'view_project'));
create policy experts_self on public.expert_profiles for select to authenticated using (user_id = auth.uid());
create policy requests_expert on public.service_requests for select to authenticated using (public.is_assigned_expert(id));
create policy handoffs_owner on public.project_handoffs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy handoffs_expert on public.project_handoffs for select to authenticated
  using (exists (select 1 from public.expert_profiles e where e.id = expert_id and e.user_id = auth.uid()));
create policy jobs_requester on public.job_milestones for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = service_request_id and r.requester_id = auth.uid()));
create policy jobs_expert on public.job_milestones for select to authenticated using (public.is_assigned_expert(service_request_id));

grant select on public.github_installations, public.scans, public.project_findings, public.verification_runs,
  public.expert_profiles, public.project_handoffs, public.job_milestones to authenticated;
-- admins: no client privileges at all (membership is managed by the project owner via SQL)
revoke all on public.admins from anon, authenticated;
grant all on all tables in schema public to service_role;

-- ---------- server-only functions ----------
-- Atomic rescan merge. Preserves user decisions; auto-resolves findings no longer present.
create function public.sync_findings(p_project_id uuid, p_scan_id uuid, p_findings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb;
  v_new integer := 0;
  v_reopened integer := 0;
  v_resolved integer;
  v_existing public.project_findings%rowtype;
begin
  for f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) loop
    select * into v_existing from public.project_findings
      where project_id = p_project_id and fingerprint = f ->> 'fingerprint' for update;
    if not found then
      insert into public.project_findings (project_id, rule_id, fingerprint, kind, category, severity, title, detail, remedy, evidence, milestone_key, first_seen_scan, last_seen_scan)
      values (p_project_id, f ->> 'rule_id', f ->> 'fingerprint', f ->> 'kind', f ->> 'category', f ->> 'severity',
              f ->> 'title', f ->> 'detail', coalesce(f ->> 'remedy', ''), coalesce(f -> 'evidence', '[]'::jsonb), f ->> 'milestone_key', p_scan_id, p_scan_id);
      v_new := v_new + 1;
    else
      update public.project_findings set
        kind = f ->> 'kind', severity = f ->> 'severity', title = f ->> 'title', detail = f ->> 'detail', remedy = coalesce(f ->> 'remedy', remedy),
        evidence = coalesce(f -> 'evidence', '[]'::jsonb), milestone_key = f ->> 'milestone_key',
        last_seen_scan = p_scan_id, updated_at = now(),
        -- resolved findings that are seen again were never really fixed (auto-resolved by a scan, or
        -- merely CLAIMED fixed by the user): reopen them. Dismissals and in-progress work are user
        -- decisions and are left alone.
        status = case when v_existing.status = 'resolved' then 'open' else v_existing.status end,
        resolution_source = case when v_existing.status = 'resolved' then null else v_existing.resolution_source end
      where id = v_existing.id;
      if v_existing.status = 'resolved' then v_reopened := v_reopened + 1; end if;
    end if;
  end loop;

  -- not seen this time: open/in-progress work is confirmed fixed by the scan, and a user's "resolved"
  -- claim is upgraded to scan-confirmed. Only scan-confirmed resolutions count towards verification.
  update public.project_findings set status = 'resolved', resolution_source = 'rescan', updated_at = now()
    where project_id = p_project_id and last_seen_scan is distinct from p_scan_id
      and (status in ('open', 'in_progress') or (status = 'resolved' and resolution_source = 'user'));
  get diagnostics v_resolved = row_count;
  return jsonb_build_object('new', v_new, 'reopened', v_reopened, 'resolved', v_resolved);
end $$;
revoke all on function public.sync_findings(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_findings(uuid, uuid, jsonb) to service_role;

-- Idempotent XP/achievement grant outside the exercise flow (e.g. verified milestones).
create function public.award_xp(p_user_id uuid, p_awards jsonb, p_achievements text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_award jsonb;
  v_inserted integer;
  v_added integer := 0;
  v_total integer;
begin
  insert into public.user_progress (user_id) values (p_user_id) on conflict do nothing;
  for v_award in select * from jsonb_array_elements(coalesce(p_awards, '[]'::jsonb)) loop
    insert into public.xp_awards (user_id, award_key, source, xp, occurred_at)
      values (p_user_id, v_award ->> 'award_key', v_award ->> 'source', (v_award ->> 'xp')::integer, (v_award ->> 'occurred_at')::timestamptz)
      on conflict (user_id, award_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then v_added := v_added + (v_award ->> 'xp')::integer; end if;
  end loop;
  if p_achievements is not null then
    insert into public.achievements_earned (user_id, achievement_id)
      select p_user_id, unnest(p_achievements) on conflict do nothing;
  end if;
  update public.user_progress set total_xp = total_xp + v_added, updated_at = now()
    where user_id = p_user_id returning total_xp into v_total;
  return jsonb_build_object('xp_added', v_added, 'total_xp', v_total);
end $$;
revoke all on function public.award_xp(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.award_xp(uuid, jsonb, text[]) to service_role;
