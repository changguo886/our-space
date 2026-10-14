-- Our Space V3 M2: execution intentions without creating calendar bookings.
-- STAGING FIRST. Do not run on Production until staging CRUD/RLS tests pass.
BEGIN;
CREATE TABLE IF NOT EXISTS public.todo_execution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('flexible','window')),
  planned_minutes integer NOT NULL CHECK (planned_minutes > 0 AND planned_minutes <= 1440),
  window_start time,
  window_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_execution_plans_window_valid CHECK (
    (mode = 'flexible' AND window_start IS NULL AND window_end IS NULL)
    OR (mode = 'window' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start)
  )
);
CREATE INDEX IF NOT EXISTS todo_execution_plans_todo_date_idx ON public.todo_execution_plans(todo_id, plan_date);
ALTER TABLE public.todo_execution_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "execution plans owner select" ON public.todo_execution_plans;
CREATE POLICY "execution plans owner select" ON public.todo_execution_plans FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS "execution plans owner insert" ON public.todo_execution_plans;
CREATE POLICY "execution plans owner insert" ON public.todo_execution_plans FOR INSERT TO authenticated
WITH CHECK (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS "execution plans owner update" ON public.todo_execution_plans;
CREATE POLICY "execution plans owner update" ON public.todo_execution_plans FOR UPDATE TO authenticated
USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())))
WITH CHECK (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS "execution plans owner delete" ON public.todo_execution_plans;
CREATE POLICY "execution plans owner delete" ON public.todo_execution_plans FOR DELETE TO authenticated
USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())));
COMMIT;
-- Fixed booked time blocks continue to use public.todo_sessions, NOT this table.
-- No data changes or deletions in existing tables.
