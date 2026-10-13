-- Our Space V4 / Phase 5A: retire strictly empty legacy metadata tables.
-- This migration is intentionally limited. It does not remove:
--   schedule_rules (still referenced by todo_sessions FK / legacy RPC);
--   todo_execution_plans (still written by TodoExecutionSchedule);
--   todos.task_date, scheduled_start/end (still consumed by Web/Tauri);
--   habit_logs (will become completion ledger after API work).
-- Prerequisite: a verified database backup and deployment of V4 Web release.
BEGIN;
DO $guard$
DECLARE cnt bigint;
BEGIN
 SELECT count(*) INTO cnt FROM public.task_goal_settings;
 IF cnt<>0 THEN RAISE EXCEPTION 'STOP: task_goal_settings has % rows',cnt; END IF;
 SELECT count(*) INTO cnt FROM public.task_occurrences;
 IF cnt<>0 THEN RAISE EXCEPTION 'STOP: task_occurrences has % rows',cnt; END IF;
 IF EXISTS (SELECT 1 FROM public.todos WHERE task_type NOT IN ('one_time','project','routine')) THEN
   RAISE EXCEPTION 'STOP: legacy todo task_type remains';
 END IF;
END
$guard$;
-- RESTRICT is deliberate. If an external SQL object depends on either
-- table, the transaction fails rather than silently deleting dependencies.
DROP TABLE public.task_goal_settings RESTRICT;
DROP TABLE public.task_occurrences RESTRICT;
COMMIT;
-- Do NOT treat this as proof that application/PLpgSQL dynamic references are absent.
-- Before running, ensure old task RPCs and clients are no longer called.
