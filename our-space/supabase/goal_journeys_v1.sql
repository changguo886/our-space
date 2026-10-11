-- Goal Journey V1: independent long-term goal presentation.
-- Does not change todos, todo_sessions, or scheduled calendar fields.
create table if not exists public.goal_journeys (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null unique references public.todos(id) on delete cascade,
  start_date date not null,
  target_date date not null,
  animal_type text not null default 'cat' check (animal_type in ('cat', 'dog', 'rabbit', 'fox')),
  journey_type text not null default 'swim' check (journey_type in ('swim', 'run', 'hike', 'cycle')),
  status text not null default 'active' check (status in ('active', 'finished')),
  final_completion_percent integer check (final_completion_percent between 0 and 100),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_dates_valid check (target_date >= start_date),
  constraint journey_completion_consistent check (
    (status = 'active' and finished_at is null and final_completion_percent is null)
    or (status = 'finished' and finished_at is not null and final_completion_percent is not null)
  )
);

create index if not exists goal_journeys_active_idx on public.goal_journeys(status, target_date);
alter table public.goal_journeys enable row level security;

drop policy if exists "Journey owner can read" on public.goal_journeys;
create policy "Journey owner can read" on public.goal_journeys
  for select to authenticated using (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = auth.uid())
  );
drop policy if exists "Journey owner can insert" on public.goal_journeys;
create policy "Journey owner can insert" on public.goal_journeys
  for insert to authenticated with check (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = auth.uid())
  );
drop policy if exists "Journey owner can update" on public.goal_journeys;
create policy "Journey owner can update" on public.goal_journeys
  for update to authenticated using (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = auth.uid())
  );
drop policy if exists "Journey owner can delete" on public.goal_journeys;
create policy "Journey owner can delete" on public.goal_journeys
  for delete to authenticated using (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = auth.uid())
  );
