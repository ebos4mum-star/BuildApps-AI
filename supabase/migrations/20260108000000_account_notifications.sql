-- Notification preferences, device registrations and a provider-independent outbox.
-- Clients may read their own preferences. Device tokens and the outbox are server-only: tokens are credentials
-- for pushing to a person's phone and must never be readable from a client.
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push boolean not null default false,
  email boolean not null default false,
  categories jsonb not null default '{}'::jsonb,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  updated_at timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null check (char_length(token) between 8 and 500),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);
create index device_tokens_user_idx on public.device_tokens (user_id);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  category text not null check (char_length(category) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or (char_length(link) <= 200 and link like '/%')),
  dedupe_key text unique check (dedupe_key is null or char_length(dedupe_key) <= 200),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_outbox_due_idx on public.notification_outbox (status, send_after);

alter table public.notification_prefs enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notification_outbox enable row level security;
create policy prefs_own on public.notification_prefs for select to authenticated using (user_id = auth.uid());
grant select on public.notification_prefs to authenticated;
grant all on public.notification_prefs, public.device_tokens, public.notification_outbox to service_role;

-- Erasure support: the audit log stays immutable, with one exception. When a user is deleted the foreign key
-- anonymises the actor (actor_id -> null). That single-column change is allowed; every other update or any
-- delete is still refused, even for the service role.
create or replace function public.admin_audit_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null and new.actor_id is null
     and new.id = old.id and new.action = old.action and new.target_type = old.target_type
     and new.target_id = old.target_id and new.detail = old.detail and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'admin_audit rows are immutable' using errcode = '42501';
end $$;
