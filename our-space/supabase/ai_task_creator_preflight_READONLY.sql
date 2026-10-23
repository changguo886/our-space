-- AI Task Creator V1: READ-ONLY database verification.
-- Run in Supabase SQL Editor against the intended environment. No data changes.
SELECT c.table_name,c.column_name,c.data_type,c.is_nullable,c.column_default
FROM information_schema.columns c
WHERE c.table_schema='public'
  AND c.table_name IN ('todos','todo_subtasks','goal_journeys','habit_patterns_v3')
ORDER BY c.table_name,c.ordinal_position;

SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('save_task_v4','create_ai_task_v1')
ORDER BY p.proname;

SELECT tablename,policyname,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('todos','todo_subtasks','goal_journeys','habit_patterns_v3')
ORDER BY tablename,policyname;

SELECT tc.table_name,tc.constraint_name,tc.constraint_type,
       pg_get_constraintdef(c.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_namespace ns ON ns.nspname=tc.table_schema
JOIN pg_class cl ON cl.relname=tc.table_name AND cl.relnamespace=ns.oid
JOIN pg_constraint c ON c.conrelid=cl.oid AND c.conname=tc.constraint_name
WHERE tc.table_schema='public'
  AND tc.table_name IN ('todos','todo_subtasks','goal_journeys','habit_patterns_v3')
ORDER BY tc.table_name,tc.constraint_name;
