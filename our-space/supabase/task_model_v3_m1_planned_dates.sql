-- Our Space V3 / M1: planned-project date semantics (ADDITIVE).
-- REVIEWED PROPOSAL ONLY. Committing SQL does NOT execute it.
-- First verify actual columns/constraints in STAGING and Production using
-- audit_todo_model_v3_readonly.sql; check backup and environment ref.
-- No backfill, no task-type rewrite, no recurring rule deletion.
--
-- Semantics:
-- todos.task_date = existing legacy planning/Today compatibility; DO NOT change.
-- plan_start_date = optional start of finite project planning horizon.
-- target_finish_date = intended finish (the user's own target).
-- deadline_date = optional external/hard deadline, independent from target.
-- todos.created_at / completed_at = observed lifecycle facts, unchanged.
-- Date defaults belong in user-timezone-aware UI, not CURRENT_DATE in SQL.
BEGIN;

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS plan_start_date date,
  ADD COLUMN IF NOT EXISTS target_finish_date date,
  ADD COLUMN IF NOT EXISTS deadline_date date;

-- Enforce only unambiguous intra-record order. These are nullable for
-- simple one-time Todos, habits, and existing rows.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.todos'::regclass
      AND conname = 'todos_plan_date_order_v3'
  ) THEN
    ALTER TABLE public.todos
      ADD CONSTRAINT todos_plan_date_order_v3
      CHECK (plan_start_date IS NULL OR target_finish_date IS NULL
        OR plan_start_date <= target_finish_date);
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS todos_target_finish_v3_idx
  ON public.todos (user_id, target_finish_date)
  WHERE target_finish_date IS NOT NULL;

COMMIT;

-- Postflight, READ ONLY:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns WHERE table_schema='public' AND
-- table_name='todos' AND column_name IN
-- ('plan_start_date','target_finish_date','deadline_date')
-- ORDER BY column_name;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='public.todos'::regclass AND conname='todos_plan_date_order_v3';
-- SELECT count(*) FROM public.todos;
