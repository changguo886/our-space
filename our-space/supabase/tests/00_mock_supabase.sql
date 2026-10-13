-- Minimal stand-in for the Supabase environment, used ONLY by supabase/tests/run.sh against a
-- throwaway local PostgreSQL. It mirrors the live V4 schema of the task tables (as exported on
-- 2026-10-12) closely enough to execute migrations, RPCs and RLS. Never run this on Supabase.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public, extensions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), timezone text);
CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  group_id uuid,
  title text NOT NULL,
  description text,
  estimated_minutes integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','completed')),
  started_at timestamptz,
  elapsed_seconds integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_date date NOT NULL,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  category text,
  custom_tag text,
  task_type text NOT NULL DEFAULT 'one_time' CHECK (task_type IN ('one_time','project','routine')),
  origin_todo_id uuid REFERENCES public.todos(id),
  plan_start_date date,
  target_finish_date date,
  deadline_date date,
  color_hex text
);
CREATE TABLE public.todo_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false
);
CREATE TABLE public.quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  subtask_id uuid CONSTRAINT quick_notes_subtask_id_fkey REFERENCES public.todo_subtasks(id),
  content text NOT NULL DEFAULT ''
);
CREATE TABLE public.todo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  mode text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed','window','flexible')),
  plan_date date,
  planned_minutes integer,
  window_start time,
  window_end time,
  subtask_id uuid,
  reminder_minutes_before integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_sessions_valid_time CHECK (
    (mode = 'fixed' AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_end > scheduled_start)
    OR (mode = 'window' AND scheduled_start IS NULL AND scheduled_end IS NULL AND plan_date IS NOT NULL
        AND planned_minutes BETWEEN 1 AND 1440 AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start)
    OR (mode = 'flexible' AND scheduled_start IS NULL AND scheduled_end IS NULL AND plan_date IS NOT NULL
        AND planned_minutes BETWEEN 1 AND 1440 AND window_start IS NULL AND window_end IS NULL))
);
CREATE TABLE public.habit_patterns_v3 (
  todo_id uuid PRIMARY KEY REFERENCES public.todos(id) ON DELETE CASCADE,
  period text NOT NULL, arrangement text NOT NULL, target_count integer NOT NULL,
  weekdays smallint[] NOT NULL DEFAULT '{}', month_days smallint[] NOT NULL DEFAULT '{}',
  include_month_end boolean NOT NULL DEFAULT false,
  starts_on date, ends_on date, strict boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  value numeric(12,2) NOT NULL DEFAULT 1 CHECK (value > 0),
  unit text NOT NULL DEFAULT 'count' CHECK (unit IN ('count','minute','hour','page','km','custom')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.focus_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.todo_execution_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  slot_key uuid NOT NULL DEFAULT gen_random_uuid(),
  starts_on date NOT NULL,
  ends_on date,
  start_time time,
  end_time time,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  execution_mode text NOT NULL DEFAULT 'fixed',
  selector_kind text NOT NULL DEFAULT 'all',
  selector_value smallint,
  replaces_slot_key uuid,
  planned_minutes integer,
  window_start time,
  window_end time,
  CONSTRAINT execution_template_unique_key UNIQUE (todo_id, slot_key, starts_on)
);
CREATE TABLE public.todo_execution_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  slot_key uuid NOT NULL,
  occurrence_date date NOT NULL,
  action text NOT NULL,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_override_unique UNIQUE (todo_id, slot_key, occurrence_date)
);

-- Owner-only RLS, same pattern as the live policies.
DO $$
DECLARE t text;
BEGIN
  ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY todos_owner ON public.todos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  FOREACH t IN ARRAY ARRAY['todo_subtasks','quick_notes','todo_sessions','habit_patterns_v3','habit_logs','focus_entries','todo_execution_templates','todo_execution_overrides'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_all ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.todos x WHERE x.id = todo_id AND x.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.todos x WHERE x.id = todo_id AND x.user_id = auth.uid()))', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
