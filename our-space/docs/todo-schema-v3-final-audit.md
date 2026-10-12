# Todo Schema V3 Final Audit — preliminary repository review
Date: 2026-10-12
Branch: feature/task-model-v2
Status: **audit + proposal**, no Production changes.

## Scope and assumptions
Owner says Production contains only disposable test Todo data. This permits a controlled rebuild of *Todo-domain* sample records, but it does NOT authorize deleting authentication, profiles, memberships, other app data, or running destructive SQL immediately. Actual database metadata and row counts have not been read; repository code is the evidence. Confirm production schema via read-only introspection before designing the executable migration.

## Product-level data owners (one authoritative value per meaning)
| Domain | Table | Decision |
| --- | --- | --- |
| Task identity and metadata | todos | **KEEP**. One parent Todo; planned project represented by plan_start_date/target_finish_date/deadline_date. Avoid converting planned project into habit semantics. |
| Child tasks | todo_subtasks | **KEEP**, independent. |
| Work notes | quick_notes | **KEEP**, Todo-level grouped by optional subtask_id, RLS via owner Todo. |
| Habit recurrence | habit_patterns_v3 | **CANONICAL TARGET** after all UI/Calendar migration. Daily N, weekly quota/days, monthly quota/days + month-end. |
| Old recurrence | schedule_rules | **TRANSITIONAL**. Inspect old Calendar, Today, recurrence writers and Tauri before removal. No unsupervised DROP. |
| Habit goal fields | task_goal_settings | **REVIEW**. Count target duplicates habit_patterns_v3; keep optional performance targets only after code migration. Do not maintain two frequency counts. |
| Single-day flexible/window execution intentions | todo_execution_plans | **KEEP**. They do not book calendar. Define create/edit/delete and duplicate behavior. |
| Series default exact clock times | todo_execution_templates | **KEEP**. Stable slot_key; effective date range; independent from habit frequency. Can serve finite planned project execution schedules. |
| One-off exception | todo_execution_overrides | **KEEP**. Cancel or reschedule exact occurrence without changing series. Validate slot ownership and no double-render. |
| One-off calendar appointment | todo_sessions | **KEEP**. Calendar and Focus may read/use it; not equal to recurring virtual slots. |
| Legacy one-off date/times | todos.scheduled_start, todos.scheduled_end | **DEPRECATE LATER** only after all Web, Calendar, Tauri readers have moved to Sessions. Currently referenced in TodoList and CalendarViews. |
| Explicit occurrence state | task_occurrences | **KEEP** but clarify stable identity and relation to habit_logs. Do not materialize all future events. |
| Recorded habit activity | habit_logs | **KEEP**, authoritative actual habit completion entries (multiple per day possible). |
| Actual focus | existing Focus tables/events | **KEEP AS-IS**, audit in desktop before changing. |
| Journey | goal_journeys | **KEEP**, for planned projects. Not a repeated-occurrence store. |

## Concrete repository issues confirmed
1. AddTodoForm currently has **two creation strategies**: older weekly habits call `create_scheduled_todo_v2` (writes todos + schedule_rules); daily/monthly habits insert into `todos` directly; all habit types subsequently insert into `habit_patterns_v3` and `task_goal_settings`. **Failure in a later insert can leave a partially created task**. Implement a single validated atomic create/edit transaction/RPC for canonical pattern, goals and optional templates.
2. TodoList editor reads/writes `schedule_rules` but not `habit_patterns_v3`. Editing monthly habit dates is not yet supported. Shared create/edit UI alone is insufficient without canonical read/write.
3. The repeated frequency has multiple representations: schedule_rules cadence/weekdays/quota, habit_patterns_v3 period/arrangement/target_count and task_goal_settings.period/target_value. Canonical frequency should be in habit_patterns_v3; goal settings only independent optional thresholds; old rule is a temporary migration projection until readers removed.
4. For fixed month days, `target_count` cannot always equal occurrences in a month. UI derives the real count after excluding nonexistent dates and deduplicating last-day token.
5. M4 template start_time/end_time constraint prohibits cross-midnight slots and UNIQUE only protects duplicate (todo,slot_key,starts_on), not overlapping effective spans. Decide whether V1 disallows overnight repeating blocks explicitly or add validated end-day offset; do not silently accept a broken entry.
6. M4 override references (todo_id,slot_key) without enforcing that slot exists for parent Todo. Add application validation before linking; consider an FK-friendly canonical slot identity in a later migration.
7. M3/M4 SQL use CREATE POLICY without IF EXISTS / prior DROP, so rerunning them is **not** safely idempotent. Migration runner needs installed-migration tracking and environment preflight.
8. CalendarViews week/month currently only reads `todo_sessions` or legacy `todos.scheduled_*`; CalendarPlanner day session editor writes `todo_sessions`. No current expansion of `todo_execution_templates` into virtual occurrences. Virtual id must NEVER be sent to todo_sessions update/delete endpoints.
9. TodoExecutionSchedule currently writes one-off slots/plans; it does not edit/delete existing entries nor define series scope. Its new inputs are keyboard-friendly, but not yet combined with calendar picking. Preserve this separately from schema consolidation.
10. QuickNotes component writes quick_notes and reads subtasks; retain its association and ON DELETE SET NULL behavior. Do not combine data tables for superficial table-count reduction.

## Minimal decision before authoring executable migration
1. Capture production read-only metadata: exact column types/defaults, constraints, policies, indexes, triggers, relevant functions and row counts. Also capture task-related use in app/tauri files.
2. Define atomic create/edit RPC inputs and outputs for habit patterns and planned projects. If all legacy data is disposable, optionally **delete test Todos in a scoped explicit operation**, then remove old schedule_rules usage from clients and later deprecate table only after references are zero.
3. Avoid rewriting current M3/M4 migration files already applied. Write a **new forward migration** with deliberate DDL after inspecting live schema. No blind CREATE OR REPLACE that changes meaning of an installed RPC.
4. Implement pure recurrence expansion service: period, fixed-day rules, starts_on, ends_on, timezone, effective template spans and exception precedence, with stable (todo_id,slot_key,occurrence_date) identity. Test 28/29/30/31, leap years, DST, cancellation, edit-this/this-and-future.
5. Migrate Calendar day/week/month, Todo list & card, Task editing UI to same read model. Keep one parent Todo per habit; cards show upcoming occurrence and real progress.
6. Test Mini Focus launch/stop/save, Notes, auth/RLS, focus history; build and run cross-account smoke test; only then retire old fields or merge.

## Safety limits
- No SQL migration has been executed by this audit.
- “Disposable Todo data” is not permission to clear all Supabase data.
- Never rely on unverified live DB contents for DROP/RENAME choices.
- Prefer 1 correct source of truth to 1 fewer table.
