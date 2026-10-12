# Our Space V3 — closed Beta release gate (2026-10-12)

Scope: two existing testers, Production currently used by Web. This does not bypass safe migration checks.

## Architecture contract
- Habit frequency: daily N; weekly flexible N or fixed weekdays; monthly flexible N or fixed 1..31 (+ last-day token). Dates absent from short months are skipped, not shifted. Daily multiple logs are distinct.
- A fixed weekday is a repeat *date*, not a booked Calendar block.
- Execution templates save future default exact clock times per habit, with effective start/end dates and timezone. Support same-day override and future-series change; never prepopulate years of todo_sessions.
- Calendar hourly view contains real fixed slots: persisted todo_sessions and virtual template occurrences. Flexible and preferred-window plans stay out of hourly/all-day Calendar.
- One Todo card per habit, not separate parent Todos for repeated instances. Repeated occurrences have stable (todo,slot_key,date) identity; deduplicate when explicit sessions/overrides exist.
- Stats and Focus read real logs; changing future template must not rewrite past facts.
- Tauri Mini Focus stays independent UI and keeps established Todo / Focus / Notes interfaces; validate before merge.

## Current branch audit at this commit
- M3 habit_patterns_v3 is a PROPOSAL, **not applied**. Its target_count for monthly fixed is not authoritative in short months; derive current target from date expansion. Existing create_scheduled_todo_v2 RPC supports only daily, weekly_days, weekly_quota. Required: new atomic create/edit service/RPC that persists pattern and task_goal_settings coherently.
- M4 todo_execution_templates and todo_execution_overrides migration is **committed, not applied**. It does NOT hook into Calendar yet.
- CalendarViews week/month directly use todos' stored todo_sessions; CalendarPlanner day mode uses its own editable session scheduler. New virtual occurrences must be rendered read-only or need explicit materialization before drag/edit. Do not spoof virtual ids as database session UUIDs.
- Creating a fixed one-off slot uses todo_sessions. There are legacy scheduled_start/end fields on todos; preserve until audited.
- Do NOT describe a code/SQL commit as deployed or verified without the actual Production operation/build.
- Existing edits for routine tasks with type conversion remain guarded, not full shared Create/Edit drawer.

## Release checklist before telling testers 'live'
1. Confirm DB backup and actual schema/constraints/RLS/function definitions in target Production.
2. Validate M3, M4 SQL against a disposable/staging DB; dry-run idempotence and permissions, then explicit Production approval.
3. Implement atomic create/edit of daily N, monthly N/month-days and recurring templates, preserving old schedule_rules behavior.
4. Implement virtual Calendar expansion for current view, timezone and DST, stable occurrences, edits of single/future series and deduplication.
5. Implement Todo card next-slot + progress, and one-habit-card-per-day aggregation.
6. Build, typecheck and manually test two accounts (RLS cross-account), each period and time mode, 28/29/30/31, DST, single override, future override, existing sessions, Mini Focus start/stop and Quick Notes create/edit/delete.
7. Merge only after tests; verify deployed ref in hosting, recheck live behavior and rollback readiness.

## Production SQL
Never execute unreviewed M3/M4 merely because app is invite-only. Migration version numbers do not imply the DB is migrated.
