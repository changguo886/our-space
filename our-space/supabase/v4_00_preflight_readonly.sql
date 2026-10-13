-- Our Space V4: read-only pre-reset checks. Safe to run in Supabase SQL Editor.
-- Does not back up data. Use Supabase database backup / pg_dump separately.
SELECT current_database() AS database_name, current_user AS sql_role, now() AS captured_at;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('todos','todo_sessions','todo_subtasks','quick_notes',
'goal_journeys','goal_journey_days','habit_patterns_v3','habit_logs',
'todo_execution_plans','todo_execution_templates','todo_execution_overrides',
'schedule_rules','task_occurrences','task_goal_settings','focus_entries')
ORDER BY table_name,ordinal_position;
SELECT c.conrelid::regclass AS source_table,c.conname AS fk_name,
c.confrelid::regclass AS target_table,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.contype='f'
AND (c.conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
 OR c.confrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace))
ORDER BY 1,2;
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,
pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND (pg_get_functiondef(p.oid) ILIKE '%schedule_rules%'
 OR pg_get_functiondef(p.oid) ILIKE '%habit_patterns_v3%'
 OR pg_get_functiondef(p.oid) ILIKE '%todo_sessions%'
 OR pg_get_functiondef(p.oid) ILIKE '%task_occurrences%'
 OR pg_get_functiondef(p.oid) ILIKE '%task_goal_settings%')
ORDER BY p.proname;
SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'
AND tablename IN ('todos','todo_sessions','habit_patterns_v3','habit_logs','quick_notes','goal_journeys','goal_journey_days') ORDER BY tablename,policyname;
SELECT 'todos' AS entity, count(*) FROM public.todos
UNION ALL SELECT 'sessions',count(*) FROM public.todo_sessions
UNION ALL SELECT 'subtasks',count(*) FROM public.todo_subtasks
UNION ALL SELECT 'notes',count(*) FROM public.quick_notes
UNION ALL SELECT 'journeys',count(*) FROM public.goal_journeys
UNION ALL SELECT 'journey_days',count(*) FROM public.goal_journey_days
UNION ALL SELECT 'focus_entries',count(*) FROM public.focus_entries
UNION ALL SELECT 'rules',count(*) FROM public.habit_patterns_v3
UNION ALL SELECT 'habit_logs',count(*) FROM public.habit_logs;
SELECT task_type,status,count(*) FROM public.todos GROUP BY task_type,status ORDER BY 1,2;
-- Export these results; then take a complete, independently restorable SQL/pg_dump backup.
