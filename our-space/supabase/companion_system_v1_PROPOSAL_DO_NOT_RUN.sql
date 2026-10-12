-- Companion System V1 - PROPOSAL ONLY, DO NOT EXECUTE IN PRODUCTION.
-- Review and test RLS and migration on staging before applying.
-- Prerequisite: public.goal_journeys from goal_journeys_v1.sql.

create table if not exists public.user_companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species_key text not null check (species_key in ('cat','dog','rabbit','fox')),
  name text not null default '',
  is_active boolean not null default false,
  appearance_config jsonb not null default '{"skinKey":"default","equipped":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists user_companions_one_active_per_user
  on public.user_companions (user_id) where is_active;
create unique index if not exists user_companions_id_user_unique
  on public.user_companions (id,user_id);

alter table public.user_companions enable row level security;
create policy "Owners read companions" on public.user_companions for select to authenticated using(user_id=auth.uid());
create policy "Owners insert companions" on public.user_companions for insert to authenticated with check(user_id=auth.uid());
create policy "Owners update companions" on public.user_companions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Owners delete companions" on public.user_companions for delete to authenticated using(user_id=auth.uid());

-- Retain existing goal_journeys.animal_type for backward compatibility.
alter table public.goal_journeys add column if not exists companion_id uuid references public.user_companions(id) on delete set null;

-- Daily status does NOT move or mutate todo_sessions.
create table if not exists public.goal_journey_days (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.goal_journeys(id) on delete cascade,
  day_date date not null,
  day_status text not null default 'planned'
    check(day_status in ('planned','progress','completed','rest','skipped')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(journey_id,day_date)
);
alter table public.goal_journey_days enable row level security;
create policy "Owner read journey days" on public.goal_journey_days for select to authenticated using (
  exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
    where j.id=journey_id and t.user_id=auth.uid())
);
create policy "Owner insert journey days" on public.goal_journey_days for insert to authenticated with check (
  exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
    where j.id=journey_id and t.user_id=auth.uid())
);
create policy "Owner update journey days" on public.goal_journey_days for update to authenticated using (
  exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
    where j.id=journey_id and t.user_id=auth.uid())
) with check (
  exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
    where j.id=journey_id and t.user_id=auth.uid())
);
create policy "Owner delete journey days" on public.goal_journey_days for delete to authenticated using (
  exists(select 1 from public.goal_journeys j join public.todos t on t.id=j.todo_id
    where j.id=journey_id and t.user_id=auth.uid())
);

-- Before deploying: add server-enforced cross-owner validation for
-- goal_journeys.companion_id; FK alone is NOT sufficient.
-- Inventory and currency ledger deliberately deferred until award semantics
-- and server-side idempotent transaction functions are reviewed.
