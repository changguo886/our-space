-- V4 Phase 5: targeted read-only audit before retiring legacy objects.
-- Run in Supabase SQL Editor. No modifications.
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
       substring(pg_get_functiondef(p.oid) from 1 for 1200) AS definition_excerpt
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (
 pg_get_functiondef(p.oid) ILIKE '%task_occurrences%'
 OR pg_get_functiondef(p.oid) ILIKE '%task_goal_settings%'
 OR pg_get_functiondef(p.oid) ILIKE '%schedule_rules%'
 OR pg_get_functiondef(p.oid) ILIKE '%todo_execution_plans%'
) ORDER BY p.proname;

SELECT con.conname, con.conrelid::regclass AS referencing_table,
       con.confrelid::regclass AS referenced_table, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con WHERE con.contype='f'
AND con.confrelid IN (
 'public.task_goal_settings'::regclass,
 'public.task_occurrences'::regclass,
 'public.schedule_rules'::regclass,
 'public.todo_execution_plans'::regclass
) ORDER BY referenced_table,referencing_table;

SELECT 'task_goal_settings' AS name, count(*) AS rows FROM public.task_goal_settings
UNION ALL SELECT 'task_occurrences', count(*) FROM public.task_occurrences
UNION ALL SELECT 'schedule_rules', count(*) FROM public.schedule_rules
UNION ALL SELECT 'todo_execution_plans', count(*) FROM public.todo_execution_plans;
