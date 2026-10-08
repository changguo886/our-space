-- =========================================================
-- Our Space · Reminder V1
--
-- Run this once in Supabase SQL Editor before using Reminder V1.
--
-- Reminder belongs to a calendar session, not the Todo itself.
-- null = no reminder
-- 0    = at session start
-- 5/10/15/30/60 = minutes before scheduled_start
-- =========================================================

alter table public.todo_sessions
  add column if not exists reminder_minutes_before integer null;

alter table public.todo_sessions
  drop constraint if exists todo_sessions_reminder_minutes_before_check;

alter table public.todo_sessions
  add constraint todo_sessions_reminder_minutes_before_check
  check (
    reminder_minutes_before is null
    or reminder_minutes_before in (0, 5, 10, 15, 30, 60)
  );

create index if not exists todo_sessions_reminder_start_idx
  on public.todo_sessions (scheduled_start)
  where reminder_minutes_before is not null;

comment on column public.todo_sessions.reminder_minutes_before is
  'Reminder offset in minutes before scheduled_start. NULL disables reminder.';
