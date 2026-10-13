-- Our Space V4 phase 7, reviewed 2026-10-12.
-- Run only with a verified backup and after deploying the V4 session writer.
-- This does not delete Todo, notes, focus records, sessions or social data.
-- Legacy database routines are dropped in the SAME transaction as legacy tables.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.todo_execution_plans) THEN
    RAISE EXCEPTION 'STOP: todo_execution_plans has records. Migrate before cleanup.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_rules) THEN
    RAISE EXCEPTION 'STOP: schedule_rules has records. Migrate before cleanup.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.todo_sessions WHERE schedule_rule_id IS NOT NULL) THEN
    RAISE EXCEPTION 'STOP: todo_sessions uses a legacy rule.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.todos WHERE task_type NOT IN ('one_time','project','routine')) THEN
    RAISE EXCEPTION 'STOP: task types are not migrated.';
  END IF;
END
$guard$;
-- Exact signatures verified from the earlier live database function inventory.
-- Old clients using these RPCs must be retired before this script.
DROP FUNCTION IF EXISTS public.create_recurring_todo(
  text,text,integer,date,text,text,uuid,text,smallint[],smallint,date,text
) RESTRICT;
DROP FUNCTION IF EXISTS public.create_scheduled_todo_v2(
  text,text,integer,date,text,text,uuid,text,text,smallint[],smallint,date,text
) RESTRICT;
-- Remove the FK first. Session records themselves are retained.
ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_todo_rule_fkey;
ALTER TABLE public.todo_sessions DROP COLUMN IF EXISTS schedule_rule_id;
DROP TABLE public.todo_execution_plans RESTRICT;
DROP TABLE public.schedule_rules RESTRICT;
COMMIT;
-- After COMMIT, verify the two tables and old RPCs no longer exist.
