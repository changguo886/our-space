-- V4.09 schedule integrity (D10, B03). Additive; safe to run more than once.
-- The app code on this branch works without it: it is the database-side backstop.
-- Run the PREFLIGHT queries first; if either returns rows, resolve them before the BEGIN block.

-- PREFLIGHT 1: current delete rule of quick_notes.subtask_id (expect 'n' = SET NULL after this file).
-- SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'quick_notes_subtask_id_fkey';
-- PREFLIGHT 2: fixed sessions of one task that already overlap (must be empty before step 2).
-- SELECT a.todo_id, a.id, b.id FROM public.todo_sessions a JOIN public.todo_sessions b
--   ON a.todo_id = b.todo_id AND a.id < b.id AND a.mode = 'fixed' AND b.mode = 'fixed'
--  AND tstzrange(a.scheduled_start, a.scheduled_end) && tstzrange(b.scheduled_start, b.scheduled_end);

BEGIN;

-- 1. Deleting a step must keep its notes: they move to "Unsorted" (subtask_id becomes NULL).
ALTER TABLE public.quick_notes DROP CONSTRAINT IF EXISTS quick_notes_subtask_id_fkey;
ALTER TABLE public.quick_notes
  ADD CONSTRAINT quick_notes_subtask_id_fkey
  FOREIGN KEY (subtask_id) REFERENCES public.todo_subtasks(id) ON DELETE SET NULL;

-- 2. Two fixed sessions of the same task may never overlap, even with concurrent saves.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_no_fixed_overlap;
ALTER TABLE public.todo_sessions
  ADD CONSTRAINT todo_sessions_no_fixed_overlap
  EXCLUDE USING gist (todo_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&)
  WHERE (mode = 'fixed');

COMMIT;

-- ROLLBACK (only if needed):
-- BEGIN;
-- ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_no_fixed_overlap;
-- ALTER TABLE public.quick_notes DROP CONSTRAINT IF EXISTS quick_notes_subtask_id_fkey;
-- ALTER TABLE public.quick_notes ADD CONSTRAINT quick_notes_subtask_id_fkey
--   FOREIGN KEY (subtask_id) REFERENCES public.todo_subtasks(id);
-- COMMIT;
