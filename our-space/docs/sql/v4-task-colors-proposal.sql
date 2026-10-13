-- REVIEW BEFORE APPLYING. Back up public.todos and goal_journeys first.
-- Idempotent, non-destructive addition of a canonical per-task display color.
BEGIN;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS color_hex text;
UPDATE public.todos t
SET color_hex = CASE
  WHEN j.color_key ~* '^#[0-9a-f]{6}$' THEN upper(j.color_key)
  WHEN j.color_key = 'blue' THEN '#4B83D1'
  WHEN j.color_key = 'green' THEN '#38A179'
  WHEN j.color_key = 'purple' THEN '#9268C5'
  WHEN j.color_key = 'orange' THEN '#DE9144'
  WHEN j.color_key = 'pink' THEN '#D9769B'
  WHEN j.color_key = 'teal' THEN '#329B9C'
  ELSE '#38A179'
END
FROM public.goal_journeys j
WHERE j.todo_id = t.id AND t.color_hex IS NULL;
UPDATE public.todos SET color_hex = '#38A179' WHERE color_hex IS NULL;
ALTER TABLE public.todos ALTER COLUMN color_hex SET DEFAULT '#38A179';
ALTER TABLE public.todos ADD CONSTRAINT todos_color_hex_format_v4_check CHECK (color_hex ~* '^#[0-9a-f]{6}$');
COMMIT;
-- Preflight before executing: verify no existing column/constraint incompatibilities, RLS update policy,
-- and whether legacy save_task_v4 writes still have permission to update the new field.
-- Rollback (separate deliberate migration, not automatic): ALTER TABLE public.todos DROP CONSTRAINT todos_color_hex_format_v4_check;
-- Do not drop color_hex if colors have been created since applying the migration.
