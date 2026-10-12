# Our Space Todo V3 — Canonical Field Contract
Status: LOCKED design contract, cleanup gated by code migration and live dependency review.
Updated: 2026-10-12. Repository: changguo886/our-space; branch feature/task-model-v2.

## Canonical data and column ownership

| Store | Canonical columns / meaning | Do not duplicate |
| --- | --- | --- |
| todos | id, user_id, group_id, title, description, category, custom_tag, task_type, status, task_date; plan_start_date, target_finish_date, deadline_date for finite planned project; estimated_minutes optional task estimate | A recurring habit is a *single* parent Todo. Do not store its frequency in todos. |
| todo_subtasks | id, todo_id, checklist content/completion/order | Keep separate from notes |
| quick_notes | id, todo_id, subtask_id nullable, title, content, color, sort_order, created_at, updated_at | No redundant user_id; ON DELETE SET NULL on subtask removal |
| habit_patterns_v3 | todo_id PK, period: day/week/month; arrangement: flexible/fixed; target_count, weekdays, month_days, include_month_end | The **only new authoritative habit recurrence**. Week fixed target_count == weekdays length; month fixed target count must be calculated per actual month, NOT blindly use stored target_count. |
| todo_execution_plans | id, todo_id, plan_date, mode flexible/window, planned_minutes, window_start, window_end | Intent, never an hourly Calendar booking |
| todo_execution_templates | id, todo_id, slot_key, starts_on, ends_on, start_time, end_time, timezone | Default exact-time repeat; one template may yield many virtual instances |
| todo_execution_overrides | id, todo_id, slot_key, occurrence_date, action, scheduled_start/end | One-date cancellation or reschedule |
| todo_sessions | id, todo_id, scheduled_start/end, reminder_minutes_before | Persisted one-off booked slot |
| task_occurrences | id, todo_id, occurrence_key, occurrence_date, status, completed_at | Explicit outcome / exception; not every future virtual slot |
| habit_logs | id, todo_id, occurred_on, value, unit, note | Actual habit check-in |
| goal_journeys | todo_id, start_date, target_date, Journey presentation fields | Planned project visual progress |
| Focus-related existing tables | actual Focus session duration / history | **Never** replace with intended effort or template duration |

## Deprecated or review-only data

- `schedule_rules` (all fields): deprecated new-write surface; **still read/written in TodoList editor**. Old RPC `create_scheduled_todo_v2` also references it. Do not DROP until that editor and any Today/Tauri readers are migrated. User reported 0 rows, which does not establish absence of dependencies.
- `task_goal_settings.period`, `task_goal_settings.target_value`: duplicate recurrence frequency in the old data model. Retain table temporarily for optional duration/performance thresholds; avoid new frequency writes. User reported 2 rows: inspect before cleanup.
- `todos.scheduled_start`, `todos.scheduled_end`: deprecated slot fallback, **still used by CalendarViews and TodoList**; do not DROP until migrated. `todo_sessions` is the canonical real booking.
- `schedule_rules.target_minutes`: do not move into recurrence model. Effort estimate, performance minimum and exact booked duration are three different facts.
- `habit_patterns_v3.target_count` for fixed month patterns is structural/validation metadata, not a constant monthly-completion denominator.
- Neither generated Calendar event count nor projected next session time requires a new persisted Todo column.

## Required cleanup dependency order

1. Switch all **habit creation** to save_habit_v3 RPC (already committed in AddTodoForm); avoid split inserts and old weekly RPC.
2. Switch **habit editing** to same RPC with canonical pattern preload; TodoList currently uses `schedule_rules`. Verify edit updates never rewrite history and allow month/day changes.
3. Migrate Today, Card and Calendar frequency readers to `habit_patterns_v3`; virtual exact-time templates to Calendar via stable identity.
4. Audit Tauri Focus Companion task/notes/focus uses; verify no `schedule_rules` and `todos.scheduled_*` dependencies remain.
5. Decide actual cleanup (DROP schedule_rules, old RPC; DROP redundant goal frequency columns; DROP todos.scheduled_*), **only** after live metadata, function/trigger references and client references are all zero, with a backup and a separate reviewed SQL migration.
6. Run two-account RLS and habit/calendar/focus regression before merging.

## Invariants

- The UI controls are not independent sources of truth. Fixed weekdays/month days determine their own effective count; flexible target_count is user-entered.
- A saved schema snapshot and migration version are required before removing columns.
- Never `DROP ... CASCADE` to make a migration pass. Repair callers first.
- Preserve todo_sessions, todo_subtasks, quick_notes, actual Focus activity, and habit_logs as separate facts.
- No destructive schema change on Production without a full checklist and user confirmation for the exact proposed statements.
