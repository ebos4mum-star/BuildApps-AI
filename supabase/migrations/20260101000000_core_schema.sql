-- BuildApps AI core schema. Principles:
--  * RLS is enabled on every table; clients can only SELECT their own rows.
--  * Anything affecting progression (attempts, XP, streaks, milestones, entitlements) is written
--    ONLY by the server via the service role. Clients never submit XP, pass/fail or verification.
--  * XP awards are idempotent via UNIQUE (user_id, award_key).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create function public.validate_timezone() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_validate_tz before insert or update of timezone on public.profiles
  for each row execute function public.validate_timezone();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), ''));
  insert into public.user_progress (user_id) values (new.id);
  return new;
end $$;

-- ---------- learning progress (server-written) ----------
create table public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_active_day date,
  rest_days_available integer not null default 1 check (rest_days_available between 0 and 2),
  /* optimistic-concurrency token: bumped on every server write */
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.challenge_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) <= 128),
  attempt_number integer not null check (attempt_number >= 1),
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index challenge_attempts_user_idx on public.challenge_attempts (user_id, created_at desc);

create table public.exercise_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  first_passed_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table public.xp_awards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  award_key text not null check (char_length(award_key) <= 300),
  source text not null check (source in ('exercise', 'skill_demonstration', 'project_milestone', 'reward')),
  xp integer not null check (xp > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint xp_awards_user_key_unique unique (user_id, award_key)
);

create table public.achievements_earned (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------- projects (shared across web / iOS / Android) ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  journey text not null check (journey in ('start', 'continue', 'rescue')),
  state text not null default 'draft'
    check (state in ('draft', 'active', 'needs_help', 'in_verification', 'completed', 'archived')),
  description text check (char_length(description) <= 2000),
  repo_owner text,
  repo_name text,
  recovery_stage text check (recovery_stage in ('assess', 'triage', 'plan', 'resume')),
  human_help_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rescue_needs_recovery check (journey <> 'rescue' or (recovery_stage is not null and repo_owner is not null)),
  constraint repo_pair check ((repo_owner is null) = (repo_name is null))
);
create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  title text not null,
  required boolean not null default true,
  weight integer not null default 1 check (weight between 1 and 10),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  /* 'verified' can only be written by the server and must carry evidence */
  completion_source text check (completion_source in ('user_reported', 'verified')),
  evidence_ref text,
  completed_at timestamptz,
  unique (project_id, key),
  constraint verified_has_evidence check (completion_source is distinct from 'verified' or evidence_ref is not null),
  constraint done_has_source check ((status = 'done') = (completion_source is not null))
);

-- ---------- Human Developer Rescue (V1: manual matching) ----------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  summary text not null check (char_length(summary) between 10 and 2000),
  status text not null default 'submitted'
    check (status in ('submitted', 'matched', 'in_progress', 'delivered', 'verified', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------- Entitlements (Publishing Assistance, $25/app/year; unified across platforms) ----------
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind text not null check (kind in ('publishing_assistance')),
  status text not null check (status in ('active', 'expired', 'cancelled')),
  source text not null check (source in ('web', 'apple', 'google')),
  external_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.challenge_attempts enable row level security;
alter table public.exercise_completions enable row level security;
alter table public.xp_awards enable row level security;
alter table public.achievements_earned enable row level security;
alter table public.projects enable row level security;
alter table public.project_milestones enable row level security;
alter table public.service_requests enable row level security;
alter table public.entitlements enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy progress_select on public.user_progress for select to authenticated using (user_id = auth.uid());
create policy attempts_select on public.challenge_attempts for select to authenticated using (user_id = auth.uid());
create policy completions_select on public.exercise_completions for select to authenticated using (user_id = auth.uid());
create policy xp_select on public.xp_awards for select to authenticated using (user_id = auth.uid());
create policy achievements_select on public.achievements_earned for select to authenticated using (user_id = auth.uid());
create policy projects_select on public.projects for select to authenticated using (owner_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy milestones_select on public.project_milestones for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy requests_select on public.service_requests for select to authenticated using (requester_id = auth.uid());
create policy requests_insert on public.service_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'submitted'
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy entitlements_select on public.entitlements for select to authenticated using (user_id = auth.uid());

-- ---------- Privileges: deny by default, grant the minimum ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.profiles, public.user_progress, public.challenge_attempts,
  public.exercise_completions, public.xp_awards, public.achievements_earned, public.projects,
  public.project_milestones, public.service_requests, public.entitlements to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant update (name, description) on public.projects to authenticated;
grant insert (project_id, requester_id, summary) on public.service_requests to authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------- Server-only atomic progression write ----------
-- Called by the API after it has graded the answer and computed awards with @buildapps/core.
-- Idempotent: duplicate award_keys are ignored; stale callers get {status:'conflict'} and retry.
create function public.apply_attempt(
  p_user_id uuid,
  p_exercise_id text,
  p_passed boolean,
  p_expected_version integer,
  p_awards jsonb,
  p_achievements text[],
  p_streak jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_progress public.user_progress%rowtype;
  v_attempt integer;
  v_award jsonb;
  v_inserted integer;
  v_xp_added integer := 0;
  v_awarded text[] := '{}';
begin
  select * into v_progress from public.user_progress where user_id = p_user_id for update;
  if not found then
    insert into public.user_progress (user_id) values (p_user_id) on conflict do nothing;
    select * into v_progress from public.user_progress where user_id = p_user_id for update;
  end if;
  if v_progress.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'version', v_progress.version);
  end if;

  select count(*) + 1 into v_attempt from public.challenge_attempts
    where user_id = p_user_id and exercise_id = p_exercise_id;
  insert into public.challenge_attempts (user_id, exercise_id, attempt_number, passed)
    values (p_user_id, p_exercise_id, v_attempt, p_passed);

  if p_passed then
    insert into public.exercise_completions (user_id, exercise_id) values (p_user_id, p_exercise_id)
      on conflict do nothing;
  end if;

  for v_award in select * from jsonb_array_elements(coalesce(p_awards, '[]'::jsonb)) loop
    insert into public.xp_awards (user_id, award_key, source, xp, occurred_at)
      values (p_user_id, v_award ->> 'award_key', v_award ->> 'source', (v_award ->> 'xp')::integer,
              (v_award ->> 'occurred_at')::timestamptz)
      on conflict (user_id, award_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_xp_added := v_xp_added + (v_award ->> 'xp')::integer;
      v_awarded := v_awarded || (v_award ->> 'award_key');
    end if;
  end loop;

  if p_achievements is not null then
    insert into public.achievements_earned (user_id, achievement_id)
      select p_user_id, unnest(p_achievements) on conflict do nothing;
  end if;

  update public.user_progress set
    total_xp = total_xp + v_xp_added,
    current_streak = coalesce((p_streak ->> 'current')::integer, current_streak),
    longest_streak = greatest(longest_streak, coalesce((p_streak ->> 'longest')::integer, longest_streak)),
    last_active_day = coalesce((p_streak ->> 'last_active_day')::date, last_active_day),
    rest_days_available = coalesce((p_streak ->> 'rest_days_available')::integer, rest_days_available),
    version = version + 1,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_progress;

  return jsonb_build_object('status', 'ok', 'xp_added', v_xp_added, 'total_xp', v_progress.total_xp,
    'version', v_progress.version, 'awarded_keys', to_jsonb(v_awarded));
end $$;

revoke all on function public.apply_attempt(uuid, text, boolean, integer, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.apply_attempt(uuid, text, boolean, integer, jsonb, text[], jsonb) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
