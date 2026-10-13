# Our Space V4 — Data & Interaction Codebook
Status: design baseline, 2026-10-12. Reference: live DB inventory supplied by owner and code on feature/task-model-v2. NOT a claim of current schema parity.

## Verified vs unverified
- Owner verified task types one_time/project/routine and four routine RLS policies; V4 create/edit and build/function tests reported passing.
- Owner confirmed v4_05a removed task_goal_settings and task_occurrences.
- v4_06 session schema and UI were reported tested. v4_07 cleanup file was committed but execution and production table absence NOT verified.
- Still referenced by branch code: habit_patterns_v3 in TodoList, TodoExecutionSchedule, TaskBoardV2 and CalendarViews. Rename to task_rules NOT complete.
- habit_logs -> task_completions NOT complete. Do not assume any completion-write service exists.
- This project contains historical migrations/docs retaining old names: do not execute them against V4.

## Table responsibility / cardinality
| Entity (current or target) | Owner/relationship | Meaning | Disposition |
|---|---|---|---|
| todos | user_id -> profiles.id, optional group_id | parent task identity; task_type one_time/project/routine | KEEP |
| todo_subtasks | many -> one todo | checklist; source manual/ai, sort_order, optional estimated_minutes | KEEP |
| quick_notes | many -> one todo, optional subtask_id | Todo-level notes; subtask delete SET NULL -> Unsorted; content and content_json coexist | KEEP |
| todo_sessions | many -> one todo | dated fixed/window/flexible execution plans; fixed timestamps vs nonfixed plan_date | KEEP |
| todo_execution_templates | many -> one todo | virtual repeating slots; selector_kind, slot_key, replaces_slot_key, timezone, effective dates | KEEP |
| todo_execution_overrides | many -> one todo / slot_key | cancel or reschedule one virtual occurrence | KEEP |
| habit_patterns_v3 (target task_rules) | at most one per routine todo | day/week/month, flexible/fixed, target_count, weekday/monthday/month_end, starts_on, ends_on, strict | RENAME LATER |
| habit_logs (target task_completions) | many -> one routine todo | recorded completion events; existing occurred_on/value/unit/note not yet redesigned | MIGRATE LATER |
| focus_entries | many -> one todo | actual elapsed focus records, client_event_id idempotency | KEEP |
| goal_journeys | at most one per todo | pet, journey, chosen color and finish state; duplicates dates pending review | KEEP |
| goal_journey_days | many -> one journey | per-day note/status; distinguish authored notes vs derived progress | KEEP |
| profiles/user_preferences | user-owned | identity/timezone/language/preferences | KEEP |
| groups/group_members | many-to-many membership | space sharing/membership | KEEP |
| daily_entries/media/reactions/comments | social space | day posts and participation | KEEP |
| task_goal_settings/task_occurrences | removed by confirmed v4_05a | old experiment tables | RETIRED |
| schedule_rules/todo_execution_plans | pending live-schema verification after v4_07 | old recurrence + execution plan stores | CONDITIONAL RETIRED |

## Core field contracts
- task_type: one_time one finished outcome; project one finite outcome across dates; routine repeating independent completions. Never infer task completion from an elapsed Journey day.
- task_date: legacy required date retained for old readers; do not treat as canonical scheduling; optional task date is future work.
- plan_start_date / target_finish_date: project planning interval; deadline_date is independent official deadline; planned date <= target finish.
- todos.status / started_at / elapsed_seconds: old Focus state readers; keep until coordinated Web + Tauri migration.
- todo_sessions.mode: fixed (scheduled_start/end required, Calendar timed event); window (plan_date, window_start/end, planned_minutes, NO booked timestamps); flexible (plan_date + planned_minutes, NO booked timestamps). Sessions are *plans*, not measured focus.
- Rule weekdays ISO 1..7; fixed month day 31 skipped in short months; month_end dedupes overlapping last-day rule. Flexible N is a count, not N allocated calendar events.
- Strict routine: due/overdue evaluation is future service behavior; rule stores strict flag; no automatic penalty for nonstrict.
- Completion vs focus: completion is occurrence/performance event; focus_entries is actual duration; never double count, don't backfill fake focus records.
- Templates: retain slot_key identity, revision effective range, replaces_slot_key replacement behavior, override by (todo_id,slot_key,occurrence_date).
- Notes: one Todo-level right panel, grouped Unsorted then subtask sections. Web approx 380px; Tauri independent compact UI, same DB semantics.

## Interaction contract
1. Create: choose one_time/project/routine, title, optional category/visibility; project requires start+target finish; routine requires period + arrangement + target count; detailed schedule comes after creation.
2. Edit: use save_task_v4. Routine edit requires loaded rule. Conversion between families still **unsupported** by deployed RPC; surface safe user messaging, not silent mutation.
3. Work: steps/checklist + per-day execution plan + template changes + Notes Panel; preserve related notes and focus on edits.
4. Today: virtual eligibility plus dated sessions; flexible plans appear in agenda, never timed grid.
5. Calendar: fixed sessions and fixed virtual template occurrences only in hour slots; cancellation/reschedule applied per occurrence.
6. Completion: one-time/project mark terminal completed once; routine completion event per performed instance; identity/date uniqueness and edit-single/series not implemented yet.
7. Focus: write real elapsed time independently of completion; no fake backfill. Tauri uses its own UI.
8. Journey: elapsed days !== completed steps; day notes and user-selected color persist.

## Variable/API dictionary
| Variable / API | Current source | Required invariant |
|---|---|---|
| todos.id / origin_todo_id | todos | origin links a follow-on task; origin != self |
| todos.task_type | todos | exactly one_time/project/routine |
| todo_subtasks.source | todo_subtasks | manual or ai |
| quick_notes.subtask_id | quick_notes | nullable = Unsorted; SET NULL on step deletion |
| todo_sessions.mode/plan_date | todo_sessions | mode-specific required columns |
| todo_execution_templates.slot_key | templates | stable virtual execution slot |
| todo_execution_templates.replaces_slot_key | templates | preserve suppression of overridden default |
| todo_execution_overrides.occurrence_date | overrides | override targets one slot/day |
| habit_patterns_v3.strict | rule | default false, not automatic overdue engine |
| focus_entries.client_event_id | focus_entries | deduplicate replayed focus events |
| save_task_v4(payload,edit_id) | deployed RPC | atomic create/edit, types native after v4_04; no cross-type conversion |
| get_agenda(from,to,timezone) | proposal ONLY | future single read contract for Today/Calendar/social/AI |
| task_completions | proposal ONLY | future independent actual completion event model |

## Risk register / compatibility gates
- Never DROP a table merely because count=0: inspect FK, SQL routine, V4 branch and Tauri callers.
- v4_07 may already be applied: confirm with to_regclass, not script presence.
- No automatic table renames before rewriting RLS, triggers and current clients in same release.
- Beware UTC timestamps vs user-selected local day, DST, recurring month-end and revision overlaps.
- Preserve Journey dates until Journey RLS owner/date constraints reworked.
- For any destructive DDL: independent verified dump + rollback instructions + owner sign-off.
- Do not infer an executed migration, successful build or regression from a GitHub commit.
