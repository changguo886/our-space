-- V4 session unification: schema preparation. Run only after reviewed backup.
-- This file does not drop old plans or any task data.
BEGIN;
ALTER TABLE public.todo_sessions ALTER COLUMN scheduled_start DROP NOT NULL;
ALTER TABLE public.todo_sessions ALTER COLUMN scheduled_end DROP NOT NULL;
ALTER TABLE public.todo_sessions DROP CONSTRAINT IF EXISTS todo_sessions_valid_time;
ALTER TABLE public.todo_sessions ADD CONSTRAINT todo_sessions_valid_time CHECK (
  (mode = 'fixed' AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
    AND scheduled_end > scheduled_start)
  OR
  (mode = 'window' AND scheduled_start IS NULL AND scheduled_end IS NULL
    AND plan_date IS NOT NULL AND planned_minutes BETWEEN 1 AND 1440
    AND window_start IS NOT NULL AND window_end IS NOT NULL
    AND window_end > window_start)
  OR
  (mode = 'flexible' AND scheduled_start IS NULL AND scheduled_end IS NULL
    AND plan_date IS NOT NULL AND planned_minutes BETWEEN 1 AND 1440
    AND window_start IS NULL AND window_end IS NULL)
);
CREATE INDEX IF NOT EXISTS todo_sessions_plan_date_v4_idx
 ON public.todo_sessions(todo_id,plan_date) WHERE plan_date IS NOT NULL;
COMMIT;
