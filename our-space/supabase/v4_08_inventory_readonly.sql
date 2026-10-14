-- Our Space V4 live-schema verification (read-only; safe to run).
-- Reports whether old/new tables exist, no missing table errors.
WITH names(table_name,expected) AS (
 VALUES
 ('todos','keep'),('todo_subtasks','keep'),('quick_notes','keep'),
 ('todo_sessions','keep'),('todo_execution_templates','keep'),
 ('todo_execution_overrides','keep'),('focus_entries','keep'),
 ('goal_journeys','keep'),('goal_journey_days','keep'),
 ('habit_patterns_v3','rename-pending'),('habit_logs','rename-pending'),
 ('schedule_rules','retire-pending-check'),('todo_execution_plans','retire-pending-check'),
 ('task_goal_settings','expected-absent'),('task_occurrences','expected-absent'),
 ('task_rules','future-name'),('task_completions','future-name')
)
SELECT table_name,expected,
 CASE WHEN to_regclass(format('public.%I',table_name)) IS NOT NULL THEN 'PRESENT' ELSE 'ABSENT' END AS live_status
FROM names ORDER BY table_name;

SELECT con.conname AS fk_name,
 con.conrelid::regclass AS from_table,con.confrelid::regclass AS to_table
FROM pg_catalog.pg_constraint con
WHERE con.contype='f'
 AND (con.conrelid='public.todo_sessions'::regclass OR con.conrelid='public.quick_notes'::regclass)
ORDER BY from_table,fk_name;

SELECT p.proname AS function_name FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND p.proname IN (
 'save_task_v4','create_recurring_todo','create_scheduled_todo_v2','save_habit_v3','get_agenda')
ORDER BY p.proname;
