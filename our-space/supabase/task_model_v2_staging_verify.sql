-- Read-only verification in STAGING after phase1 and phase2 migrations.
-- Run in Supabase SQL Editor in the STAGING project only.
SELECT current_database() AS database_name, current_schema() AS schema_name;
SELECT t.task_type, count(*) AS todo_count
  FROM public.todos t GROUP BY t.task_type ORDER BY t.task_type;
SELECT
  (SELECT count(*) FROM public.todos) AS todos,
  (SELECT count(*) FROM public.todo_sessions) AS sessions,
  (SELECT count(*) FROM public.quick_notes) AS notes,
  (SELECT count(*) FROM public.goal_journeys) AS journeys,
  (SELECT count(*) FROM public.task_occurrences) AS occurrences,
  (SELECT count(*) FROM public.habit_logs) AS habit_logs;
SELECT c.table_name,c.column_name,c.data_type,c.is_nullable
 FROM information_schema.columns c
 WHERE c.table_schema='public' AND
 c.table_name IN ('todos','task_occurrences','habit_logs')
 AND (c.table_name <> 'todos' OR c.column_name='task_type')
 ORDER BY c.table_name,c.ordinal_position;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
 AND tablename IN ('todos','task_occurrences','habit_logs')
 ORDER BY tablename;
SELECT tablename,policyname,cmd FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('task_occurrences','habit_logs')
 ORDER BY tablename,cmd;
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_scheduled_todo_v2';
-- Should return zero: a Todo with a recurrence rule must not remain 'one_time'.
SELECT count(*) AS mislabeled_recurring_todos
 FROM public.todos t WHERE t.task_type='one_time'
 AND EXISTS(SELECT 1 FROM public.schedule_rules r WHERE r.todo_id=t.id);
-- No mutation. Functional create tests must be performed in a staging-linked app
-- using a real authenticated user; SQL Editor's privileged role does not test RLS.
