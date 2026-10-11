-- Journey Calendar V1 daily status. Run after goal_journeys_v1.sql.
-- Rest only marks the journey day; it does NOT move scheduled sessions.
create table if not exists public.goal_journey_days (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.goal_journeys(id) on delete cascade,
  day_date date not null,
  day_status text not null default 'planned'
    check (day_status in ('planned','progress','completed','rest','skipped')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, day_date)
);
create index if not exists goal_journey_days_date_idx on public.goal_journey_days(journey_id,day_date);
alter table public.goal_journey_days enable row level security;
drop policy if exists "Journey calendar read" on public.goal_journey_days;
create policy "Journey calendar read" on public.goal_journey_days for select to authenticated
using (exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
  where j.id=journey_id and t.user_id=auth.uid()));
drop policy if exists "Journey calendar insert" on public.goal_journey_days;
create policy "Journey calendar insert" on public.goal_journey_days for insert to authenticated
with check (exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
  where j.id=journey_id and t.user_id=auth.uid() and day_date between j.start_date and j.target_date));
drop policy if exists "Journey calendar update" on public.goal_journey_days;
create policy "Journey calendar update" on public.goal_journey_days for update to authenticated
using (exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
  where j.id=journey_id and t.user_id=auth.uid()))
with check (exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
  where j.id=journey_id and t.user_id=auth.uid() and day_date between j.start_date and j.target_date));
drop policy if exists "Journey calendar delete" on public.goal_journey_days;
create policy "Journey calendar delete" on public.goal_journey_days for delete to authenticated
using (exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
  where j.id=journey_id and t.user_id=auth.uid()));
