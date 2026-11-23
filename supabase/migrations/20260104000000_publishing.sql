-- Stage 6: Publishing Center.
-- BuildApps submits NOTHING to any store. Everything about submissions and review outcomes is recorded
-- by the project owner (user-reported). Verified readiness comes only from scan/verification evidence,
-- which is computed by the server at read time and is never stored as a client-writable status.
-- Same rules as before: RLS on every table, clients SELECT only, the server (service_role) writes.

-- ---------- Publishing Assistance reuses the service-request infrastructure ----------
alter table public.service_requests add column kind text not null default 'rescue' check (kind in ('rescue', 'publishing'));

alter table public.project_handoffs drop constraint project_handoffs_scopes_check;
alter table public.project_handoffs add constraint project_handoffs_scopes_check
  check (cardinality(scopes) >= 1 and scopes <@ array['view_project', 'view_scans', 'view_findings', 'view_verification', 'view_publishing']);

-- ---------- targets, claims, releases, submissions ----------
create table public.publish_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null check (platform in ('apple_app_store', 'google_play', 'web')),
  /* validated server-side per platform; never holds credentials */
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, platform)
);

alter table public.service_requests add column publish_target_id uuid references public.publish_targets (id) on delete set null;

/* The user's CLAIMS about requirements. A claim is never 'verified': verification is computed from evidence. */
create table public.publish_claims (
  target_id uuid not null references public.publish_targets (id) on delete cascade,
  requirement_key text not null check (char_length(requirement_key) between 1 and 80),
  kind text not null check (kind in ('self_reported', 'not_applicable')),
  note text not null check (char_length(note) between 5 and 500),
  updated_at timestamptz not null default now(),
  primary key (target_id, requirement_key)
);

create table public.publish_releases (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.publish_targets (id) on delete cascade,
  version text not null check (version ~ '^\d{1,4}\.\d{1,4}\.\d{1,4}([-+][0-9A-Za-z.-]{1,20})?$'),
  build_number text check (char_length(build_number) <= 20),
  notes text check (char_length(notes) <= 2000),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'submitted', 'in_review', 'rejected', 'approved', 'released', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_id, version)
);

create table public.publish_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.publish_releases (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'withdrawn')),
  /* free-text reference the owner pastes (e.g. a build id); never a credential */
  store_reference text check (char_length(store_reference) <= 200),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (release_id, attempt_number)
);
/* at most ONE active attempt per release: submitting twice cannot create duplicates */
create unique index one_active_submission_per_release on public.publish_submissions (release_id) where status in ('submitted', 'in_review');

create table public.publish_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.publish_submissions (id) on delete cascade,
  outcome text not null check (outcome in ('rejected', 'approved', 'info_requested')),
  reason_category text not null check (reason_category in ('metadata', 'privacy', 'crash_or_bug', 'guideline', 'security', 'legal', 'performance', 'other')),
  guideline_ref text check (char_length(guideline_ref) <= 40),
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.publish_actions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.publish_releases (id) on delete cascade,
  feedback_id uuid references public.publish_feedback (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  detail text check (char_length(detail) <= 1000),
  requirement_key text check (char_length(requirement_key) <= 80),
  finding_id uuid references public.project_findings (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'wont_fix')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);

/* Append-only audit trail of every publishing action (immutable even for the server role). */
create table public.publish_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  target_id uuid,
  release_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('owner', 'expert', 'admin', 'system')),
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index publish_events_project_idx on public.publish_events (project_id, created_at);
create trigger publish_events_no_update before update on public.publish_events
  for each row execute function public.request_events_immutable();

-- ---------- database-level state machine (defence in depth: even a server bug cannot skip steps) ----------
create function public.publish_release_transition_guard() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('ready', 'withdrawn')) or
    (old.status = 'ready' and new.status in ('draft', 'submitted', 'withdrawn')) or
    (old.status = 'submitted' and new.status in ('in_review', 'approved', 'rejected', 'withdrawn')) or
    (old.status = 'in_review' and new.status in ('approved', 'rejected', 'withdrawn')) or
    (old.status = 'rejected' and new.status in ('submitted', 'withdrawn')) or
    (old.status = 'approved' and new.status = 'released')
  ) then
    raise exception 'illegal release transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger publish_release_transition before update of status on public.publish_releases
  for each row execute function public.publish_release_transition_guard();

/* a release can only be 'released' or 'approved' if some submission was actually recorded for it */
create function public.publish_release_requires_submission() returns trigger language plpgsql as $$
begin
  if new.status in ('submitted', 'in_review', 'rejected', 'approved', 'released') and not exists (select 1 from public.publish_submissions s where s.release_id = new.id) then
    raise exception 'release % has no recorded submission', new.id using errcode = '23514';
  end if;
  return new;
end $$;
create constraint trigger publish_release_needs_submission after update of status on public.publish_releases
  deferrable initially deferred for each row execute function public.publish_release_requires_submission();

-- ---------- RLS ----------
alter table public.publish_targets enable row level security;
alter table public.publish_claims enable row level security;
alter table public.publish_releases enable row level security;
alter table public.publish_submissions enable row level security;
alter table public.publish_feedback enable row level security;
alter table public.publish_actions enable row level security;
alter table public.publish_events enable row level security;

create function public.can_read_publish_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.owner_id = auth.uid())
      or public.expert_can(p_project, 'view_publishing')
$$;
create function public.can_read_publish_target(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.publish_targets t where t.id = p_target and public.can_read_publish_project(t.project_id))
$$;
create function public.can_read_publish_release(p_release uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.publish_releases r where r.id = p_release and public.can_read_publish_target(r.target_id))
$$;
create function public.can_read_publish_submission(p_submission uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.publish_submissions s where s.id = p_submission and public.can_read_publish_release(s.release_id))
$$;
revoke all on function public.can_read_publish_project(uuid), public.can_read_publish_target(uuid), public.can_read_publish_release(uuid), public.can_read_publish_submission(uuid) from public, anon;
grant execute on function public.can_read_publish_project(uuid), public.can_read_publish_target(uuid), public.can_read_publish_release(uuid), public.can_read_publish_submission(uuid) to authenticated, service_role;

create policy publish_targets_read on public.publish_targets for select to authenticated using (public.can_read_publish_project(project_id));
create policy publish_claims_read on public.publish_claims for select to authenticated using (public.can_read_publish_target(target_id));
create policy publish_releases_read on public.publish_releases for select to authenticated using (public.can_read_publish_target(target_id));
create policy publish_submissions_read on public.publish_submissions for select to authenticated using (public.can_read_publish_release(release_id));
create policy publish_feedback_read on public.publish_feedback for select to authenticated using (public.can_read_publish_submission(submission_id));
create policy publish_actions_read on public.publish_actions for select to authenticated using (public.can_read_publish_release(release_id));
create policy publish_events_read on public.publish_events for select to authenticated using (public.can_read_publish_project(project_id));

grant select on public.publish_targets, public.publish_claims, public.publish_releases, public.publish_submissions,
  public.publish_feedback, public.publish_actions, public.publish_events to authenticated;
grant all on all tables in schema public to service_role;
