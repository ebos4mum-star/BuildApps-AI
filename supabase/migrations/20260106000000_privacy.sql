-- Privacy: account deletion requests with a cooling-off period. Clients may read their own request only;
-- every write goes through the server (service role), which audits it.
create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'fulfilled')),
  reason text check (reason is null or char_length(reason) <= 500),
  requested_at timestamptz not null default now(),
  -- erasure may not be carried out before this moment, so an accidental or hijacked request can be cancelled
  not_before timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 500)
);
-- at most one pending request per user
create unique index deletion_requests_one_pending on public.deletion_requests (user_id) where status = 'pending';
create index deletion_requests_status_idx on public.deletion_requests (status, not_before);

alter table public.deletion_requests enable row level security;
create policy deletion_own on public.deletion_requests for select to authenticated using (user_id = auth.uid());
grant select on public.deletion_requests to authenticated;
grant all on public.deletion_requests to service_role;
