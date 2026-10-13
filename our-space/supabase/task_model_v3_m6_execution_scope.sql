-- V3 M6: recurring execution templates can target all dates or one rule date.
-- Run AFTER M4; additive fields, constraint updated in place. No test data is removed.
BEGIN;
ALTER TABLE public.todo_execution_templates
 ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'fixed',
 ADD COLUMN IF NOT EXISTS selector_kind text NOT NULL DEFAULT 'all',
 ADD COLUMN IF NOT EXISTS selector_value smallint,
 ADD COLUMN IF NOT EXISTS replaces_slot_key uuid,
 ADD COLUMN IF NOT EXISTS planned_minutes integer,
 ADD COLUMN IF NOT EXISTS window_start time,
 ADD COLUMN IF NOT EXISTS window_end time;
ALTER TABLE public.todo_execution_templates
 ALTER COLUMN start_time DROP NOT NULL,
 ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS execution_template_time_valid;
ALTER TABLE public.todo_execution_templates
 ADD CONSTRAINT execution_template_time_valid CHECK (
  (execution_mode='fixed' AND start_time IS NOT NULL AND end_time IS NOT NULL
   AND end_time>start_time AND window_start IS NULL AND window_end IS NULL)
  OR (execution_mode='window' AND start_time IS NULL AND end_time IS NULL
   AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end>window_start)
  OR (execution_mode='flexible' AND start_time IS NULL AND end_time IS NULL
   AND window_start IS NULL AND window_end IS NULL)
 );
ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS execution_template_selector_valid;
ALTER TABLE public.todo_execution_templates
 ADD CONSTRAINT execution_template_selector_valid CHECK (
  (selector_kind='all' AND selector_value IS NULL)
  OR (selector_kind='weekday' AND selector_value BETWEEN 1 AND 7)
  OR (selector_kind='month_day' AND selector_value BETWEEN 1 AND 31)
  OR (selector_kind='month_end' AND selector_value IS NULL)
 );
ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS execution_template_effort_valid;
ALTER TABLE public.todo_execution_templates
 ADD CONSTRAINT execution_template_effort_valid CHECK (
 planned_minutes IS NULL OR planned_minutes BETWEEN 1 AND 1440
 );
ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS execution_template_replace_scope_valid;
ALTER TABLE public.todo_execution_templates ADD CONSTRAINT execution_template_replace_scope_valid CHECK (replaces_slot_key IS NULL OR (selector_kind <> 'all' AND replaces_slot_key <> slot_key));
CREATE INDEX IF NOT EXISTS todo_execution_templates_replacement_lookup ON public.todo_execution_templates(todo_id,replaces_slot_key);
CREATE INDEX IF NOT EXISTS todo_execution_templates_rule_lookup
 ON public.todo_execution_templates(todo_id,selector_kind,selector_value,starts_on,ends_on);
COMMIT;
-- Only explicit fixed mode appears on Calendar hourly grid.
-- Future instances are derived from this row, NOT inserted into todo_sessions.
