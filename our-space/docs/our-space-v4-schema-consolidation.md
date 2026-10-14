# Our Space V4 — Pre-release schema consolidation contract

Status: TARGET ARCHITECTURE; migrations NOT executed. Supersedes conflicting V3 target-design advice, without claiming existing clients are migrated.

## Product and task kinds
Our Space is a day-centered planner. Agenda = task identity + eligible dates + execution templates/one-off sessions + overrides, expanded only for the visible date range. Completion and actual Focus are separate factual sources. Stats, social, AI and pets read these sources rather than duplicating history.

- one_time: once-only deliverable; may have no schedule, planned date, deadline or a fixed session.
- project: finite deliverable bounded by plan_start_date / target_finish_date; optional deadline_date. Repeating *work sessions* do not make its completion recurring.
- routine: recurring activity with one rule (day/week/month, flexible count or fixed weekdays/month days/month-end). strict marks missed due occurrences overdue without inventing a failed check-in.
- A project Journey may depict elapsed days separately from completion progress. A routine Journey advances on real eligible completions, not on dates merely passing.

## Target field ownership
| Data | Target owner | Decision |
| --- | --- | --- |
| Task | todos | one_time/project/routine, identity, category, plan bounds, deadline, origin_todo_id; one parent task per routine |
| Steps / notes | todo_subtasks, quick_notes | Keep separate; add optional subtask estimated_minutes; note keeps nullable subtask_id with ON DELETE SET NULL |
| Repeat rule | task_rules (future rename from habit_patterns_v3) | one row per routine: period, arrangement, target_count, weekdays, month_days, include_month_end, starts_on, ends_on, strict |
| One-day plan | todo_sessions (future consolidation) | fixed/window/flexible modes, plan_date, start/end/window, planned_minutes, optional subtask_id, source manual/ai; old Calendar/Focus dependencies must be migrated first |
| Default series | todo_execution_templates | slot_key, effective dates, selector, mode/time, timezone and source; preserve explicit replacement relationship until equivalent slot-level precedence exists |
| Exceptions | todo_execution_overrides | occurrence_date, slot_key, cancellation/reschedule, never modify historical Focus |
| Completion | task_completions (future rename from habit_logs) | todo_id, for_date, completed_at and optionally focus_entry_id after real Focus schema review; retain unit/value until evidence no longer needs them |
| Actual focus | existing Focus tables | keep without renaming until Mini Focus integration verified |
| Journey | goal_journeys, goal_journey_days | retain until UI and FK references audited; only remove provably duplicate computed columns |

## No-duplicate rules
1. Frequency targets belong to one recurrence rule, not separately in goals or parent todos.
2. A flexible weekly N quota is NOT an every-day booking. Month 31 skips nonexistent months; month-end deduplicates overlapping *occurrence dates*.
3. Only fixed sessions occupy hourly Calendar; window/flexible express intention, not measured work.
4. An all-dates 09:00 slot and a monthly-14th 15:00 slot can be an override OR an additional slot. Date overlap alone cannot distinguish them. Keep replaces_slot_key or an explicit equivalent link.
5. Parent task, scheduled time, completion and Focus facts are separate; changing rules cannot rewrite actual history.
6. Future dates are virtual; do not pre-create months or years of sessions.
7. AI can propose steps and bookings with source=ai after confirmation. Future pet reward ledger must be idempotent on source IDs; defer actual AI/pet tables.

## Proposed review and migration sequence
0. Inventory actual Production metadata, RLS, functions, triggers, indexes, row counts and active Web/Tauri reads. Verify M3–M7 state rather than assuming commits mean SQL applied.
1. Choose explicit disposable Todo test-data scope. Do not drop auth, profiles, groups, Space membership, media/social, real Focus or Notes without individual approval.
2. Implement new unified create/edit/convert transaction (future save_task_v4) and unified agenda expansion service (future get_agenda). Make client reads and writes compatible with target schema.
3. Apply NEW reviewed forward V4 migration and, if authorized, scope-limited test Todo data reset. Never blindly rerun V3 or an unverified third-party Phase A DROP script.
4. Migrate direct users of todo_execution_plans, habit_patterns_v3, todos.task_date/scheduled_*, old schedule_rules and goal_journeys before removing/renaming those columns.
5. After a zero-reference check covering SQL functions, RLS, Web and Tauri, remove redundancies with a separate explicitly reviewed migration without CASCADE.
6. Verify TypeScript build, two-account RLS, repeat date expansion, one-off overrides, fixed booking grid, focus timer, Notes, Journey and social reading before Main merge.

## Current evidence and hard stops
- TodoExecutionSchedule actively reads/writes todo_execution_plans and todo_execution_templates. Consolidating plans into sessions without code migration breaks that interface.
- M6/M7 template revisions depend on effective dates and slot_key. Replaces_slot_key is a live concept in UI and Calendar; deleting it is NOT yet authorized.
- The provided cleanup_v4_phaseA_unused.sql is an unverified proposal, NOT safely executable merely because it uses BEGIN/COMMIT or no CASCADE.
- Production data reset is acceptable only for specified test-domain records after a snapshot and exact-user approval. No SQL executed by this documentation commit.

Canonical names are TARGET names, not proof of current database table names. Maintain this one V4 contract when revising implementation.