-- Our Space V3 Todo workflow audit, READ ONLY.
-- Run in Supabase SQL Editor on STAGING first, then PRODUCTION separately.
-- Verify project URL/ref before running; this DOES NOT mutate schema or records.
-- The results are required before proposing any destructive migration.

-- 1. Column definitions for all related tables
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
 AND table_name IN ('todos','todo_subtasks','todo_sessions','quick_notes',
  'schedule_rules','task_occurrences','habit_logs','task_goal_settings',
  'focus_entries','goal_journeys','goal_journey_days')
ORDER BY table_name, ordinal_position;

-- 2. Constraints and their actual definitions
SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.connamespace='public'::regnamespace
 AND c.conrelid::regclass::text = ANY(ARRAY[
 'todos','todo_subtasks','todo_sessions','quick_notes',
 'schedule_rules','task_occurrences','habit_logs','task_goal_settings',
 'focus_entries','goal_journeys','goal_journey_days'
 ] || ARRAY[
 'public.todos','public.todo_subtasks','public.todo_sessions','public.quick_notes',
 'public.schedule_rules','public.task_occurrences','public.habit_logs','public.task_goal_settings',
 'public.focus_entries','public.goal_journeys','public.goal_journey_days'
 ])
ORDER BY table_name, c.conname;

-- 3. Existing task type distribution, including old test records
SELECT task_type, status, count(*)::int AS row_count
FROM public.todos GROUP BY task_type, status ORDER BY task_type, status;

-- 4. Row counts in each related table; safe against absent optional tables
SELECT t.table_name,
       CASE WHEN to_regclass('public.'||t.table_name) IS NOT NULL
         THEN (xpath('/row/n/text()', query_to_xml(
           format('SELECT count(*) AS n FROM public.%I', t.table_name),false,true,'')))[1]::text::bigint
         ELSE NULL END AS row_count
FROM (VALUES ('todos'),('todo_subtasks'),('todo_sessions'),('quick_notes'),
 ('schedule_rules'),('task_occurrences'),('habit_logs'),('task_goal_settings'),
 ('focus_entries'),('goal_journeys'),('goal_journey_days')) t(table_name);

-- 5. Distinguish recurrence-bearing tasks and stored planned/actual data
SELECT
 count(*)::int AS total_todos,
 count(*) FILTER (WHERE task_type='recurring')::int AS recurring_todos,
 count(*) FILTER (WHERE task_type='habit')::int AS habit_todos,
 count(*) FILTER (WHERE scheduled_start IS NOT NULL OR scheduled_end IS NOT NULL)::int AS todo_legacy_scheduled,
 count(*) FILTER (WHERE elapsed_seconds>0)::int AS legacy_focus_todos
FROM public.todos;

-- 6. Existing function definitions and execution privileges
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argument_types,
 pg_get_functiondef(p.oid) AS definition,
 p.prosecdef AS security_definer,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
 AND p.proname IN ('create_scheduled_todo_v2','start_focus_session_v2',
   'reset_focus_timer_v2','finish_focus_session')
ORDER BY p.proname;

-- 7. RLS state (privileged SQL Editor read is NOT a test of user-scoped RLS)
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
 AND c.relname IN ('todos','schedule_rules','task_goal_settings','task_occurrences',
 'habit_logs','todo_sessions','quick_notes','focus_entries','goal_journeys');

-- 8. Check known compatibility risks
SELECT
 count(*) FILTER (WHERE task_date IS NULL)::int AS todos_without_task_date,
 count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS with_completed_timestamp,
 count(*) FILTER (WHERE status='completed' AND completed_at IS NULL)::int AS completed_without_timestamp
FROM public.todos;
