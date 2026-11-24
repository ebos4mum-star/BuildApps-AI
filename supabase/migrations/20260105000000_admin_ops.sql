-- Stage 9: admin operations - account suspension, support requests, abuse reports, content flags,
-- platform audit log, and in-app notifications. All writes happen on the server (service role).

-- Suspended accounts are refused by the API; rows exist only for accounts an admin has acted on.
create table public.account_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Append-only record of every sensitive administrative action.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 40),
  target_id text not null check (char_length(target_id) between 1 and 128),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit (created_at desc);
create function public.admin_audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit rows are immutable' using errcode = '42501';
end $$;
create trigger admin_audit_no_update before update on public.admin_audit
  for each row execute function public.admin_audit_immutable();
create trigger admin_audit_no_delete before delete on public.admin_audit
  for each row execute function public.admin_audit_immutable();

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('account', 'learning', 'project', 'expert', 'publishing', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  body text not null check (char_length(body) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'expert', 'project', 'request')),
  target_id text not null check (char_length(target_id) between 1 and 128),
  reason text not null check (reason in ('spam', 'harassment', 'unsafe_content', 'impersonation', 'fraud', 'other')),
  detail text check (detail is null or char_length(detail) <= 2000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index abuse_reports_status_idx on public.abuse_reports (status, created_at);

-- Lets an admin withhold a lesson from learners (the content itself lives in the repository).
create table public.content_flags (
  lesson_id text primary key check (char_length(lesson_id) between 1 and 80),
  disabled boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or (char_length(link) <= 200 and link like '/%')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.account_status enable row level security;
alter table public.admin_audit enable row level security;
alter table public.support_requests enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.content_flags enable row level security;
alter table public.notifications enable row level security;

-- clients may only READ their own support requests, own reports and own notifications
create policy support_own on public.support_requests for select to authenticated using (user_id = auth.uid());
create policy abuse_own on public.abuse_reports for select to authenticated using (reporter_id = auth.uid());
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
grant select on public.support_requests, public.abuse_reports, public.notifications to authenticated;
-- account_status, admin_audit and content_flags: no client privileges at all
grant all on public.account_status, public.admin_audit, public.support_requests,
  public.abuse_reports, public.content_flags, public.notifications to service_role;
grant usage, select on all sequences in schema public to service_role;
