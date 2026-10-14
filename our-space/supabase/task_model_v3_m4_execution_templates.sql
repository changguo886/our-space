-- Our Space V3 M4: repeating booked-time templates and date-scoped overrides.
-- ADDITIVE, DO NOT RUN before reviewing M3 in Production and taking a backup.
-- A generated occurrence is never an actual Focus session.
BEGIN;
CREATE TABLE IF NOT EXISTS public.todo_execution_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
 slot_key uuid NOT NULL DEFAULT gen_random_uuid(),
 starts_on date NOT NULL,
 ends_on date,
 start_time time NOT NULL,
 end_time time NOT NULL,
 timezone text NOT NULL DEFAULT 'UTC',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT execution_template_time_valid CHECK (end_time > start_time),
 CONSTRAINT execution_template_date_valid CHECK (ends_on IS NULL OR ends_on >= starts_on),
 CONSTRAINT execution_template_unique_key UNIQUE(todo_id,slot_key,starts_on)
);
CREATE INDEX IF NOT EXISTS execution_templates_todo_dates ON public.todo_execution_templates(todo_id,starts_on,ends_on);
CREATE TABLE IF NOT EXISTS public.todo_execution_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
 slot_key uuid NOT NULL,
 occurrence_date date NOT NULL,
 action text NOT NULL CHECK(action IN('cancel','reschedule')),
 scheduled_start timestamptz,
 scheduled_end timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT execution_override_unique UNIQUE(todo_id,slot_key,occurrence_date),
 CONSTRAINT execution_override_time_valid CHECK (
   (action='cancel' AND scheduled_start IS NULL AND scheduled_end IS NULL)
   OR (action='reschedule' AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_end > scheduled_start)
 )
);
CREATE INDEX IF NOT EXISTS execution_overrides_todo_day ON public.todo_execution_overrides(todo_id,occurrence_date);
ALTER TABLE public.todo_execution_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_execution_overrides ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['todo_execution_templates','todo_execution_overrides'] LOOP
  EXECUTE format('CREATE POLICY "owner select" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())))',tbl);
  EXECUTE format('CREATE POLICY "owner insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())))',tbl);
  EXECUTE format('CREATE POLICY "owner update" ON public.%I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())))',tbl);
  EXECUTE format('CREATE POLICY "owner delete" ON public.%I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid())))',tbl);
 END LOOP;
END $$;
COMMIT;
-- The app expands only a visible date window and deduplicates by (todo_id,slot_key,date).
-- For each change affecting "this and future", close the previous template ends_on
-- before the effective date and insert a new row with the SAME slot_key.
-- User's saved Focus history and habit_logs are not updated.
-- This migration does not create any future todo_sessions.
