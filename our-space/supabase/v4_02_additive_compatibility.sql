-- Our Space V4 / Stage 1: ADDITIVE compatibility migration.
-- Safe for old V3 Web/Tauri clients: no table rename, no DROP, no DELETE.
-- Inspect v4_00_preflight_readonly.sql and take a verified backup first.
-- Can be executed once in Supabase SQL Editor; re-running is harmless for these columns.
BEGIN;

-- Per-step work estimate: null means unspecified, zero is not a duration.
ALTER TABLE public.todo_subtasks
  ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE public.todo_subtasks
  DROP CONSTRAINT IF EXISTS todo_subtasks_estimated_minutes_positive;
ALTER TABLE public.todo_subtasks
  ADD CONSTRAINT todo_subtasks_estimated_minutes_positive
  CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);

-- Prepare future routine semantics without changing the V3 table name or
-- existing RLS requirement that its parent Todo has task_type='habit'.
ALTER TABLE public.habit_patterns_v3
  ADD COLUMN IF NOT EXISTS starts_on date,
  ADD COLUMN IF NOT EXISTS ends_on date,
  ADD COLUMN IF NOT EXISTS strict boolean NOT NULL DEFAULT false;
ALTER TABLE public.habit_patterns_v3
  DROP CONSTRAINT IF EXISTS habit_patterns_v3_date_order;
ALTER TABLE public.habit_patterns_v3
  ADD CONSTRAINT habit_patterns_v3_date_order
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);

-- One-day plans will *eventually* share todo_sessions. Keep legacy fixed
-- columns NOT NULL for V3 clients until the V4 writer and Calendar are ready.
ALTER TABLE public.todo_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS plan_date date,
  ADD COLUMN IF NOT EXISTS planned_minutes integer,
  ADD COLUMN IF NOT EXISTS window_start time without time zone,
  ADD COLUMN IF NOT EXISTS window_end time without time zone,
  ADD COLUMN IF NOT EXISTS subtask_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.todo_sessions
  DROP CONSTRAINT IF EXISTS todo_sessions_mode_v4_check;
ALTER TABLE public.todo_sessions
  ADD CONSTRAINT todo_sessions_mode_v4_check
  CHECK (mode IN ('fixed','window','flexible'));
ALTER TABLE public.todo_sessions
  DROP CONSTRAINT IF EXISTS todo_sessions_source_v4_check;
ALTER TABLE public.todo_sessions
  ADD CONSTRAINT todo_sessions_source_v4_check
  CHECK (source IN ('manual','ai'));
ALTER TABLE public.todo_sessions
  DROP CONSTRAINT IF EXISTS todo_sessions_planned_minutes_v4_check;
ALTER TABLE public.todo_sessions
  ADD CONSTRAINT todo_sessions_planned_minutes_v4_check
  CHECK (planned_minutes IS NULL OR planned_minutes BETWEEN 1 AND 1440);

-- Do not introduce an unverified FK that might link a subtask of another Todo.
-- Subtask ownership pairing validation will be introduced with the V4 writer.
-- Existing fixed rows acquire their local calendar DATE, not the UTC date.
-- Since legacy rows lack an explicit timezone, deliberately do NOT backfill
-- plan_date from scheduled_start: client/account timezone must be resolved first.

ALTER TABLE public.todo_execution_templates
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.todo_execution_templates
  DROP CONSTRAINT IF EXISTS execution_templates_source_v4_check;
ALTER TABLE public.todo_execution_templates
  ADD CONSTRAINT execution_templates_source_v4_check
  CHECK (source IN ('manual','ai'));

COMMIT;

-- Read-only verification (run as a separate query if desired):
-- SELECT table_name,column_name,data_type
-- FROM information_schema.columns
-- WHERE table_schema='public' AND
-- ((table_name='todo_subtasks' AND column_name='estimated_minutes')
-- OR (table_name='habit_patterns_v3' AND column_name IN ('strict','starts_on','ends_on'))
-- OR (table_name='todo_sessions' AND column_name IN ('mode','plan_date','planned_minutes','window_start','window_end','subtask_id','source'))
-- OR (table_name='todo_execution_templates' AND column_name='source'))
-- ORDER BY table_name,column_name;
