-- =====================================================================================
-- Our Space V4.13 — Schedule integrity (replaces the withdrawn v4_09 draft)
-- Status: REVIEW BEFORE RUNNING. Not executed by any tool.
-- =====================================================================================
--
-- 影响范围 / Scope
--   1. public.quick_notes.subtask_id: deleting a step keeps its notes (subtask_id → NULL = "Unsorted").
--      Skipped automatically if the live constraint already has ON DELETE SET NULL.
--      The exact previous definition is saved in public.v4_13_saved_constraints for an exact rollback.
--   2. public.todo_sessions: two FIXED sessions of the SAME task may not overlap
--      (EXCLUDE … WHERE mode = 'fixed', DEFERRABLE INITIALLY DEFERRED so swapping two sessions' times
--      in one statement works). Window / flexible plans and different tasks are never restricted.
--      Touching slots (09:00–10:00 and 10:00–11:00) are allowed ('[)' ranges).
--   No rows are changed or deleted.
--
-- 不覆盖 / Not covered: overlap between a stored session and a virtual (template) occurrence is still
--   checked in the app; the database only sees stored rows.
--
-- 前置条件 / Prerequisites: v4_06 (todo_sessions.mode). Independent of v4_10–v4_12.
--
-- 只读预检 / Read-only preflight
--   -- P1 current notes FK (note confdeltype: a = no action, c = cascade, n = set null):
--   SELECT conname, confdeltype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'quick_notes_subtask_id_fkey';
--   -- P2 existing overlapping fixed sessions of one task (MUST be 0 rows; resolve them first):
--   SELECT a.todo_id, a.id, b.id, a.scheduled_start, b.scheduled_start FROM public.todo_sessions a
--     JOIN public.todo_sessions b ON a.todo_id = b.todo_id AND a.id < b.id AND a.mode = 'fixed' AND b.mode = 'fixed'
--    WHERE tstzrange(a.scheduled_start, a.scheduled_end) && tstzrange(b.scheduled_start, b.scheduled_end);
--   -- P3 btree_gist available (expect 1 row):
--   SELECT name FROM pg_available_extensions WHERE name = 'btree_gist';
--
-- 备份要求 / Backup: Supabase backup < 24h (schema-only change; data untouched).
-- 执行顺序 / Order: after v4_12 (any time after v4_06 is fine). No app change depends on it.
-- 回滚 / Rollback: ROLLBACK-BEGIN … ROLLBACK-END below; restores the saved FK definition verbatim.
-- =====================================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.v4_13_saved_constraints (
  table_name text NOT NULL,
  constraint_name text NOT NULL,
  definition text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, constraint_name)
);
ALTER TABLE public.v4_13_saved_constraints ENABLE ROW LEVEL SECURITY;  -- no policies: not visible to app users

-- 1. Notes survive step deletion -------------------------------------------------------
DO $m$
DECLARE v_def text; v_type "char";
BEGIN
  SELECT pg_get_constraintdef(oid), confdeltype INTO v_def, v_type
    FROM pg_constraint WHERE conrelid = 'public.quick_notes'::regclass AND conname = 'quick_notes_subtask_id_fkey';
  IF v_def IS NOT NULL THEN
    INSERT INTO public.v4_13_saved_constraints(table_name, constraint_name, definition)
    VALUES ('quick_notes', 'quick_notes_subtask_id_fkey', v_def) ON CONFLICT DO NOTHING;  -- first run wins
  END IF;
  IF v_type IS DISTINCT FROM 'n' THEN
    ALTER TABLE public.quick_notes DROP CONSTRAINT IF EXISTS quick_notes_subtask_id_fkey;
    ALTER TABLE public.quick_notes ADD CONSTRAINT quick_notes_subtask_id_fkey
      FOREIGN KEY (subtask_id) REFERENCES public.todo_subtasks(id) ON DELETE SET NULL;
  END IF;
END
$m$;

-- 2. Fixed sessions of one task never overlap -----------------------------------------
ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_no_fixed_overlap;
ALTER TABLE public.todo_sessions ADD CONSTRAINT todo_sessions_no_fixed_overlap
  EXCLUDE USING gist (todo_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&)
  WHERE (mode = 'fixed')
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_no_fixed_overlap;
-- DO $r$
-- DECLARE v_def text;
-- BEGIN
--   SELECT definition INTO v_def FROM public.v4_13_saved_constraints
--    WHERE table_name = 'quick_notes' AND constraint_name = 'quick_notes_subtask_id_fkey';
--   IF v_def IS NOT NULL THEN
--     ALTER TABLE public.quick_notes DROP CONSTRAINT IF EXISTS quick_notes_subtask_id_fkey;
--     EXECUTE format('ALTER TABLE public.quick_notes ADD CONSTRAINT quick_notes_subtask_id_fkey %s', v_def);
--   END IF;
-- END
-- $r$;
-- DROP TABLE IF EXISTS public.v4_13_saved_constraints;
-- COMMIT;
-- ROLLBACK-END
