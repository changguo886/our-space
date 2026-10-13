-- V4 Phase 5: read-only legacy dependency audit, v3.
-- Never call pg_get_functiondef or pg_get_function_arguments.
-- Run each SELECT independently in Supabase SQL Editor if desired.
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       p.prokind AS function_kind,
       left(p.prosrc, 1200) AS source_excerpt
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.prokind IN ('f','p')
  AND (
    p.prosrc ILIKE '%task_occurrences%'
    OR p.prosrc ILIKE '%task_goal_settings%'
    OR p.prosrc ILIKE '%schedule_rules%'
    OR p.prosrc ILIKE '%todo_execution_plans%'
  )
ORDER BY p.proname;

SELECT c.conname AS constraint_name,
       c.conrelid::regclass AS referencing_table,
       c.confrelid::regclass AS referenced_table,
       c.confdeltype AS delete_action
FROM pg_catalog.pg_constraint c
WHERE c.contype='f'
  AND c.confrelid IN (
    'public.task_goal_settings'::regclass,
    'public.task_occurrences'::regclass,
    'public.schedule_rules'::regclass,
    'public.todo_execution_plans'::regclass
  )
ORDER BY referencing_table, constraint_name;

SELECT 'task_goal_settings' AS table_name, count(*) AS row_count FROM public.task_goal_settings
UNION ALL SELECT 'task_occurrences',count(*) FROM public.task_occurrences
UNION ALL SELECT 'schedule_rules',count(*) FROM public.schedule_rules
UNION ALL SELECT 'todo_execution_plans',count(*) FROM public.todo_execution_plans;
