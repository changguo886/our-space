-- Read-only schema review for V3 habit consolidation.
-- Run in Supabase SQL editor; share results before any destructive migration.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('task_goal_settings','habit_patterns_v3','schedule_rules','todos')
ORDER BY table_name,ordinal_position;

SELECT t.relname AS table_name,c.conname AS constraint_name,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('task_goal_settings','habit_patterns_v3','schedule_rules','todos')
ORDER BY t.relname,c.conname;

SELECT schemaname,tablename,policyname,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('task_goal_settings','habit_patterns_v3','schedule_rules','todos')
ORDER BY tablename,policyname;

SELECT 'task_goal_settings' AS source,count(*) AS rows FROM public.task_goal_settings
UNION ALL SELECT 'habit_patterns_v3',count(*) FROM public.habit_patterns_v3
UNION ALL SELECT 'schedule_rules',count(*) FROM public.schedule_rules;

SELECT todo_id,count(*) FROM public.task_goal_settings GROUP BY todo_id HAVING count(*)>1;
