-- V4 Phase 5: read-only audit; fixed PostgreSQL aggregate introspection error.
-- No DROP / DELETE / ALTER. Safe to run in Supabase SQL Editor.
WITH routine_defs AS MATERIALIZED (
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
)
SELECT proname AS function_name, arguments,
       left(definition,1200) AS definition_excerpt
FROM routine_defs
WHERE definition ILIKE ANY (ARRAY[
 '%task_occurrences%','%task_goal_settings%',
 '%schedule_rules%','%todo_execution_plans%'
])
ORDER BY function_name;

SELECT con.conname AS constraint_name,
       con.conrelid::regclass AS referencing_table,
       con.confrelid::regclass AS referenced_table,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype='f'
AND con.confrelid IN (
 'public.task_goal_settings'::regclass,
 'public.task_occurrences'::regclass,
 'public.schedule_rules'::regclass,
 'public.todo_execution_plans'::regclass
)
ORDER BY referenced_table,referencing_table;

SELECT 'task_goal_settings' AS name, count(*) AS rows FROM public.task_goal_settings
UNION ALL SELECT 'task_occurrences', count(*) FROM public.task_occurrences
UNION ALL SELECT 'schedule_rules', count(*) FROM public.schedule_rules
UNION ALL SELECT 'todo_execution_plans', count(*) FROM public.todo_execution_plans;
