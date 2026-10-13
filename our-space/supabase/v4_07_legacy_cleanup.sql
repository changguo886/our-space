-- V4 Phase 7: remove two unused, empty legacy stores.
-- Preconditions: v4_06 completed, verified database backup, V4 client deployed.
-- Zero data loss is enforced by row-count checks. No CASCADE.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.todo_execution_plans) THEN
    RAISE EXCEPTION 'Stop: todo_execution_plans is not empty';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_rules) THEN
    RAISE EXCEPTION 'Stop: schedule_rules is not empty';
  END IF;
  IF EXISTS (SELECT 1 FROM public.todo_sessions WHERE schedule_rule_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Stop: a session references a legacy schedule rule';
  END IF;
END $guard$;
-- The legacy session foreign key must be detached before retiring its parent.
ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_todo_rule_fkey;
ALTER TABLE public.todo_sessions DROP COLUMN IF EXISTS schedule_rule_id;
DROP TABLE public.todo_execution_plans RESTRICT;
DROP TABLE public.schedule_rules RESTRICT;
COMMIT;
-- Legacy create_recurring_todo/create_scheduled_todo_v2 routines may still exist.
-- Revoke or remove them only after verifying their exact signatures and callers.
