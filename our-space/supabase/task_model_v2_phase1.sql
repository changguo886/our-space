-- Task Model V2 / Phase 1 (STAGING FIRST)
-- Additive migration: preserves todos, todo_sessions, quick_notes, journeys and focus counters.
-- Does NOT generate sessions or occurrences, modify schedule_rules, or change existing task status.
BEGIN;

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'one_time';

-- Existing recurring rules must not be mislabeled as one-time tasks.
UPDATE public.todos AS t SET task_type = 'recurring'
WHERE t.task_type = 'one_time'
  AND EXISTS (SELECT 1 FROM public.schedule_rules AS r WHERE r.todo_id = t.id);

DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conrelid = 'public.todos'::regclass AND conname = 'todos_task_type_valid'
 ) THEN
   ALTER TABLE public.todos ADD CONSTRAINT todos_task_type_valid
     CHECK (task_type IN ('one_time','recurring','habit'));
 END IF;
END $$;

CREATE INDEX IF NOT EXISTS todos_user_task_type_idx
  ON public.todos(user_id, task_type);

-- An occurrence is an execution outcome, not a booked calendar session.
-- occurrence_key is a stable per-rule/instance identity assigned by the application,
-- e.g. '2026-10-12' or '2026-10-12T09:00#1'; it must be stable across retries.
CREATE TABLE IF NOT EXISTS public.task_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  schedule_rule_id uuid REFERENCES public.schedule_rules(id) ON DELETE SET NULL,
  occurrence_key text NOT NULL,
  occurrence_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','skipped','cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_occurrences_key_nonempty CHECK (length(btrim(occurrence_key)) > 0),
  CONSTRAINT task_occurrences_completed_consistent CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT task_occurrences_todo_key_unique UNIQUE (todo_id, occurrence_key)
);
CREATE INDEX IF NOT EXISTS task_occurrences_todo_date_idx
  ON public.task_occurrences(todo_id, occurrence_date);

-- Habits have independent activity logs; no absence-of-log = automatic failure.
-- Multiple logs per day are valid (e.g. two reading sessions).
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  value numeric(12,2) NOT NULL DEFAULT 1 CHECK (value > 0),
  unit text NOT NULL DEFAULT 'count'
    CHECK (unit IN ('count','minute','hour','page','km','custom')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS habit_logs_todo_date_idx
  ON public.habit_logs(todo_id, occurred_on DESC);

ALTER TABLE public.task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

-- Permissions follow todo ownership. No duplicated user_id in child tables.
DROP POLICY IF EXISTS "Task occurrences owner select" ON public.task_occurrences;
CREATE POLICY "Task occurrences owner select" ON public.task_occurrences
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "Task occurrences owner insert" ON public.task_occurrences;
CREATE POLICY "Task occurrences owner insert" ON public.task_occurrences
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "Task occurrences owner update" ON public.task_occurrences;
CREATE POLICY "Task occurrences owner update" ON public.task_occurrences
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Task occurrences owner delete" ON public.task_occurrences;
CREATE POLICY "Task occurrences owner delete" ON public.task_occurrences
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Habit logs owner select" ON public.habit_logs;
CREATE POLICY "Habit logs owner select" ON public.habit_logs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "Habit logs owner insert" ON public.habit_logs;
CREATE POLICY "Habit logs owner insert" ON public.habit_logs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "Habit logs owner update" ON public.habit_logs;
CREATE POLICY "Habit logs owner update" ON public.habit_logs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Habit logs owner delete" ON public.habit_logs;
CREATE POLICY "Habit logs owner delete" ON public.habit_logs
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.todos t WHERE t.id = todo_id AND t.user_id = (SELECT auth.uid()))
  );
COMMIT;
