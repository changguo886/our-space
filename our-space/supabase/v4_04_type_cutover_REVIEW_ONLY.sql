DO $$ BEGIN RAISE EXCEPTION 'Do not execute: RPC and policy changes must be deployed together'; END $$;

-- V4 type cutover: run ONLY with the coordinated Web release.
-- No Todo row deletion, no rename of habit_patterns_v3 yet.
BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.todos WHERE task_type NOT IN ('one_time','recurring','habit','project','routine')) THEN
  RAISE EXCEPTION 'Unexpected existing task type';
 END IF;
 IF EXISTS (SELECT 1 FROM public.todos WHERE task_type='recurring') THEN
  RAISE EXCEPTION 'Legacy recurring tasks require individual review';
 END IF;
END $$;
-- Precondition: rule policy and RPC cutover must be done within this transaction.
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_task_type_valid;
ALTER TABLE public.todos ADD CONSTRAINT todos_task_type_valid
 CHECK (task_type IN ('one_time','project','routine','habit')) NOT VALID;
UPDATE public.todos SET task_type='project'
 WHERE task_type='one_time' AND plan_start_date IS NOT NULL AND target_finish_date IS NOT NULL;
UPDATE public.todos SET task_type='routine' WHERE task_type='habit';
ALTER TABLE public.todos DROP CONSTRAINT todos_task_type_valid;
ALTER TABLE public.todos ADD CONSTRAINT todos_task_type_valid CHECK (task_type IN ('one_time','project','routine'));
-- PostgreSQL checks constraints when UPDATE happens. The CHECK must allow old values until backfill.
COMMIT;
