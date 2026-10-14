# V4 Session compatibility preflight (read-only; 2026-10-13)

User-observed failure: `null value in column "scheduled_start" of relation "todo_sessions" violates not-null constraint` while saving a `flexible` execution plan.

## Why
`TodoExecutionSchedule` writes actual `scheduled_start/end` only for `mode='fixed'`. For `window` and `flexible`, the intended representation is `plan_date`, `planned_minutes`, optional window bounds, with **no booked clock time**. This matches the V4 codebook. The live database error is direct evidence that at least `scheduled_start` currently has a NOT NULL constraint. SQL migration files are not evidence of applied database state.

## Supabase SQL editor: read-only validation
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'todo_sessions'
  AND column_name IN ('mode','plan_date','scheduled_start','scheduled_end','planned_minutes','window_start','window_end')
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.todo_sessions'::regclass
ORDER BY conname;

SELECT mode, count(*) AS rows_count,
       count(*) FILTER (WHERE scheduled_start IS NULL) AS missing_start,
       count(*) FILTER (WHERE scheduled_end IS NULL) AS missing_end
FROM public.todo_sessions
GROUP BY mode
ORDER BY mode;
```

## Proposed behavior after verifying actual schema and backups
- fixed: both scheduled timestamps non-null, ordered start < end.
- window: plan_date + valid window bounds + planned_minutes, scheduled timestamps NULL.
- flexible: plan_date + planned_minutes, scheduled timestamps NULL.
- Don't fill dummy `scheduled_start` or create `focus_entries` from plans.
- Drop NOT NULL on `scheduled_start/end` only after reviewing dependent triggers, views, RLS, RPC, Calendar query and Tauri use. Reintroduce appropriate conditional CHECK rules only after existing row compatibility is checked.
- Implement via a versioned SQL migration separately; **do not run any DDL based on this note alone**.

## Color work boundary
Today `AddTodoForm` stores a project Journey `color_key` in `goal_journeys`; this is not guaranteed to be a canonical `todos` / Calendar event color. Routine lacks a comparable color in that path. Before implementation, review actual `todos` schema, Calendar query/render pipeline, and existing Journey migration; prefer one task-level color source and one shared palette, preserving Journey-specific visual meaning. No new columns or backfill until confirmed.

## UI wording
Replace \"Future dates are not bulk-inserted as real bookings\" with: \"The calendar displays future repeated sessions automatically from one rule. Only individual changes/bookings create separate records.\" Flexible quotas should appear as unallocated counts, not fixed hour-grid bookings.
