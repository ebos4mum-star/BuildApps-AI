-- Onboarding profile (self-reported, used only to personalize) and placement results.
-- placed_out records skills the learner PROVED they know through a server-graded check. It unlocks dependent
-- skills but grants no XP, level or achievement. Clients can read their own row; all writes are server-side.
create table public.learner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  experience text not null check (experience in ('new', 'some', 'experienced')),
  goals text[] not null check (cardinality(goals) between 1 and 5),
  tools text[] not null check (cardinality(tools) between 1 and 7),
  intent text not null check (intent in ('start', 'continue', 'rescue', 'learn_first')),
  pace text not null check (pace in ('light', 'steady', 'intense')),
  project_types text[] not null default '{}' check (cardinality(project_types) <= 5),
  platforms text[] not null default '{}' check (cardinality(platforms) <= 3),
  reminders_enabled boolean not null default false,
  reminder_hour smallint not null default 18 check (reminder_hour between 0 and 23),
  placed_out text[] not null default '{}' check (cardinality(placed_out) <= 40),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.learner_profiles enable row level security;
create policy learner_profiles_own on public.learner_profiles for select to authenticated using (user_id = auth.uid());
grant select on public.learner_profiles to authenticated;
grant all on public.learner_profiles to service_role;
