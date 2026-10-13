-- =====================================================================================
-- Our Space V4 — DATA FIX: routines that were wrongly completed as a whole
-- Data change only (no schema change). Run AFTER v4_10. Separate from structural migrations.
-- =====================================================================================
--
-- 影响范围 / Scope
--   Rows in public.todos with task_type IN ('routine','habit') AND status = 'completed'.
--   They become status = 'pending', completed_at = NULL. Nothing is deleted.
--   No completion events are invented for them: the old checkbox click is not a reliable record of
--   which day or how many times the routine was done.
--   A snapshot of the affected rows is kept in public.v4_fix_routine_status_snapshot for rollback.
--
-- 身份 / Identity: rows are selected and restored strictly by todos.id.
--
-- 只读预检 / Read-only preflight
--   SELECT id, title, status, completed_at, updated_at FROM public.todos
--    WHERE task_type IN ('routine','habit') AND status = 'completed' ORDER BY completed_at;
--   -- Review the list. If any of them should really end, set an end date on the rule instead
--   -- (habit_patterns_v3.ends_on) after this fix; a routine is never "completed".
--   SELECT conname, convalidated FROM pg_constraint WHERE conname = 'todos_routine_never_completed';
--   -- expect one row (from v4_10), convalidated = false.
--
-- 备份要求 / Backup: Supabase backup newer than 24h (the snapshot table below is an extra safety net).
-- 执行顺序 / Order: v4_10 → deploy Phase 1 app → this file.
-- =====================================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.v4_fix_routine_status_snapshot (
  todo_id uuid PRIMARY KEY,
  old_status text NOT NULL,
  old_completed_at timestamptz,
  fixed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v4_fix_routine_status_snapshot ENABLE ROW LEVEL SECURITY;  -- no policies: invisible to app users

INSERT INTO public.v4_fix_routine_status_snapshot(todo_id, old_status, old_completed_at)
SELECT id, status, completed_at FROM public.todos
 WHERE task_type IN ('routine','habit') AND status = 'completed'
ON CONFLICT (todo_id) DO NOTHING;

UPDATE public.todos t
   SET status = 'pending', completed_at = NULL, updated_at = now()
  FROM public.v4_fix_routine_status_snapshot s
 WHERE t.id = s.todo_id AND t.status = 'completed';

-- From now on the rule also holds for existing rows.
ALTER TABLE public.todos VALIDATE CONSTRAINT todos_routine_never_completed;

COMMIT;

-- 验证 / Post-check (expect 0 and true):
--   SELECT count(*) FROM public.todos WHERE task_type IN ('routine','habit') AND status = 'completed';
--   SELECT convalidated FROM pg_constraint WHERE conname = 'todos_routine_never_completed';

-- 回滚 / ROLLBACK (requires dropping the CHECK first, because restored rows violate it):
-- BEGIN;
--   ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_routine_never_completed;
--   UPDATE public.todos t SET status = s.old_status, completed_at = s.old_completed_at
--     FROM public.v4_fix_routine_status_snapshot s WHERE t.id = s.todo_id;
-- COMMIT;
-- After a successful release the snapshot table can be dropped in a later, separate cleanup.
