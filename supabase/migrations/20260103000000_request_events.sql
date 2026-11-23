-- Append-only activity trail for Human Developer Rescue jobs (also the base for platform audit trails).
-- Written only by the server; visible to the requester and the assigned expert. Rows cannot be edited.
create table public.request_events (
  id bigint generated always as identity primary key,
  service_request_id uuid not null references public.service_requests (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('owner', 'expert', 'admin', 'system')),
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (service_request_id, created_at);

create function public.request_events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'request_events rows are immutable' using errcode = '42501';
end $$;
create trigger request_events_no_update before update on public.request_events
  for each row execute function public.request_events_immutable();

alter table public.request_events enable row level security;
create policy events_requester on public.request_events for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = service_request_id and r.requester_id = auth.uid()));
create policy events_expert on public.request_events for select to authenticated
  using (public.is_assigned_expert(service_request_id));
grant select on public.request_events to authenticated;
grant all on public.request_events to service_role;
