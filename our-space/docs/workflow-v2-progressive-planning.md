# Our Space V2 — Progressive Planning Workflow (accepted 2026-10-12)

Status: **Product workflow accepted; incremental implementation underway**. This document is the source of truth for Todo / Calendar / Focus / History semantics. It supersedes earlier assumptions that every Todo must be fully specified at creation. Existing architecture and production migration safety documents remain in force.


## V3 LOCKED CONTRACT — Recurrence, Scheduling, Editing, and Data Ownership (2026-10-12)

This section overrides conflicting older planning notes below. Approved conceptual behavior; NOT a claim that the Web/Calendar implementation or Production verification is complete.

### One task, three distinct kinds of data

1. **Task definition**: `todos` is the single parent task identity. User-facing 单次任务 is a one-off outcome; 定期任务 is a finite date-range project and NOT a repeating parent Todo; 习惯养成 is a recurring activity. A planned project's dates may bound a series of execution *plans*, without transforming it into a habit. Preserve Quick Notes, subtasks, Focus history, and Tauri compatibility.
2. **Recurrence and target**: for habits, daily N, weekly flexible N or fixed weekdays (Mon=1..Sun=7), monthly flexible N or fixed selected dates 1..31 plus independent last-day token. Fixed weekdays/month-days *derive* counts: never ask to enter the same count again. Nonexistent monthly dates are skipped rather than silently shifted. Last-day token is resolved per month and deduplicated against explicit matching day. Daily N can exceed 1; a single parent Todo still appears once in its day's list, showing N progress items.
3. **Execution arrangement**: flexible effort and preferred time windows are intentions, **not bookings**. Only a fixed clock start/end generates Calendar hourly visualization. User may set a repeating default time once and apply it to future occurrences without repeatedly scheduling each date. A repeat date without a fixed time appears in the relevant daily Todo view but NOT as a Calendar hourly booking.
4. **Occurrence, exceptions, facts**: calculate unmodified future occurrences for the visible date window from rules/templates; no bulk insertion of years of future `todo_sessions`. Persist single-date changes or cancellations as overrides, stable identity `(todo_id, slot_key, occurrence_date)`. Never rewrite completed occurrences, actual Focus durations or `habit_logs` when future rules change.
5. **Editing UI**: quick-capture and full create; full editing must reuse the same type/period/date controls and load saved values. It must allow correcting fixed weekdays/month-days, quantities, and planned-project dates without delete/recreate. Editing unsaved values supports cancel/reset. On saved rule changes, default impact is this date and future, with explicit confirmation if scheduled future occurrences/overrides will be affected; display old/new date previews. Habit<->other type conversions require an explicit audited conversion workflow; do not silently rewrite history or fake a successful change.
6. **Execution UI**: first choose scope (single occurrence / all future scheduled dates / per-weekday or per-monthday presets), then flexibility/window/exact slots. Unified default exact time may apply to all selected fixed pattern days; optionally override specific weekday/monthday time presets; a single occurrence can be changed without changing the default. A finite planned project may apply a default schedule through plan end. For “future” edits, split template effective ranges rather than updating historical template rows in place.
7. **Calendar and cards**: Todo cards summarize recurrence, target end, period progress, next booking, and booked slots where data exists; omit empty metadata. Day/week/month Calendar surfaces virtual recurring exact slots and real `todo_sessions` without double-counting. Virtual items are never editable as if they were a persisted Session ID; edit produces a scoped override. The view date/timezone and DST affect slot expansion; identity must not depend on a browser-local formatted title.
8. **Target minutes**: default recurring habit creation asks only frequency; optional performance thresholds live in Goals/Stats later, while scheduled duration lives in Execution. Preserve existing minute fields for compatibility but do not have creation UI present duplicate duration targets.

### Database governance gate before ANY new SQL migration

- **No new table merely for a new UI option**. First audit current `todos`, `schedule_rules`, `habit_patterns_v3`, `task_goal_settings`, `todo_execution_plans`, `todo_execution_templates`, `todo_execution_overrides`, `todo_sessions`, `task_occurrences`, `habit_logs` and Focus/Journey tables. Maintain table independence where the data represents distinct facts.
- **Source of truth must be explicit and singular per semantic dimension**. Prefer `habit_patterns_v3` as authoritative NEW habit frequency source after migration; `schedule_rules` remains a LEGACY compatibility source until all readers/writers are migrated, never simultaneously update conflicting frequency values without an atomic validated dual-write transition. A derived current monthly fixed-day count is NOT the stored target_count; fixed-month target must be calculated per actual month.
- `task_goal_settings` holds optional *performance thresholds* only after ownership audit. Its legacy count target may duplicate `habit_patterns_v3.target_count`; do not trust both as independent frequency authorities.
- `todo_execution_templates` owns *recurring default exact time*; `todo_execution_overrides` owns *single occurrence alterations*; `todo_sessions` owns persisted *one-off booked slots*. Avoid storing virtual template slots as Sessions. Define precedence: cancelled override > rescheduled override > repeating template; persisted unrelated one-off Sessions display separately; explicitly linked materialized slots require deduplication identity.
- `todo_execution_plans` owns single-day flexible/window *intentions*, not Calendar booking; it must not claim to be a recurring exact-time template.
- `task_occurrences` tracks explicit per-occurrence status; `habit_logs` tracks actual completed activity; Focus remains the source for real focused duration. Absence of a log is not an automatic failed task. No duplicating user_id in dependent rows where RLS follows `todos.user_id`.
- Preserve legacy `todos.scheduled_start/scheduled_end` until Calendar/Web/Tauri usage audited and separately migrated. Do not combine `todos`, `todo_subtasks`, `todo_sessions`, `quick_notes` just to reduce table count.
- **Schema review checklist**: inspect production `information_schema.columns`, PK/FK/UNIQUE/CHECK, RLS policies, triggers, functions, indexes, nullability, old client references and actual row counts. Confirm M3/M4 presence and applied definitions (do not infer applied state solely from commit). Test 28/29/30/31 and DST, timezone cross-day, future-rule version splitting, exception precedence, owner isolation, duplicate insert retries, Tauri Mini Focus read paths.
- **Change policy**: additive and backward-compatible by default; versioned numbered migrations, dry run against copy/test DB, backup and rollback plan, explicit Production approval before any DDL/DML. Make deletion, merges and destructive backfills separate reviewed migrations. Do not store UI-derived counts, generated future events or duplicate computed summaries as authoritative fields.
- **Release gate**: create/edit recurrence and time templates, validate query/expansion, Calendar read-only virtual rendering and occurrence-specific edits, Todo card semantics, proper auth/RLS, focus/notes regression, build and deployment smoke tests before communicating "released".

### Immediate audit findings (repo SQL and current UI; production state NOT independently verified)

- M3 `habit_patterns_v3` alongside pre-existing `schedule_rules` creates parallel frequency definitions; the existing `create_scheduled_todo_v2` RPC supports only `daily/weekly_days/weekly_quota`, while newer daily/month creation writes `habit_patterns_v3`. A compatibility and atomic create/edit strategy is required before broadening Beta.
- Frequency is also repeated in `task_goal_settings.target_value`; fixed monthly counts change with the month's number of days. A specific authoritative-field/derivation rule is essential.
- M4 templates constrain `end_time > start_time` on the same day and currently cannot express overnight recurring slots without a reviewed schema change. Their UNIQUE `(todo_id,slot_key,starts_on)` prevents identical start revisions, but does not forbid overlapping effective date ranges per slot_key. Override FK links `todo_id` only; slot_key membership is not enforced at DB level; app/service validation needed or add a suitable constraint after audit.
- M4 RLS policy CREATE statements lack `DROP POLICY IF EXISTS`; replaying the migration after it is applied can fail. Do not rerun on Production without first checking installed policy definitions.
- M3 pattern validator checks fixed weekday/monthday range only for active matching mode; UI/service should canonicalize arrays and ensure declared source-of-truth. Monthly target count for “last-day” may overlap explicit month_day; preview must deduplicate, as M3 itself notes.
- Legacy `todos.scheduled_*`, `todo_sessions`, and new execution templates can all contribute displayed time, with different semantics. Calendar expansion must deduplicate only when they represent the *same identified occurrence*, not collapse valid independent slots.
- `todo_execution_plans` has no uniqueness per todo/day/mode; duplicates may be intentional multi-block plans, but UX needs deliberate duplicate/edit/delete semantics.
- This audit is based on repository migration files, not a live Production schema snapshot or deployed UI trace. These are review findings, NOT authorization to drop tables or migrate existing records.

---

## FINAL APPROVED TODO CREATE CONTRACT — 2026-10-12 (overrides earlier 3-type wording)

Approved UI: desktop Task List by category / status + selected task Workspace + optional 380px Todo-level Quick Notes panel; right-side creation drawer shows ONE selected type, not three parallel forms. Compact quick capture for simple tasks. User-facing labels: **单次任务 / 定期任务 / 习惯养成**. This section supersedes older uses of "定期" to mean recurring frequency.

**1. 单次任务 (one-time)** — outcome-focused, title only required. Optional intended day or precise appointment; no compulsory deadline, duration, steps, or Journey.

**2. 定期任务 (deadline-based project / planned outcome)** — despite its Chinese label, this is **NOT** a recurring series. It is one deliverable over a finite planning interval (e.g., paper or project). Minimum form: title; **plan start date defaults to the user's current date in configured timezone**, editable; **target finish date** explicitly chosen by user. Optional *separate* official external deadline; it is not automatically equal to target finish. Default dates are date-only, not hard booked hourly sessions. Creation does not demand per-day work allocation. After creating, manually add subtasks, sessions, and Notes; future AI can propose subtasks for review. Finishing parent occurs once by user action. DB modeling proposal: use `one_time` plus planned-project date fields or `planned` type only after audit; do NOT relabel existing `recurring` values without inspecting references and data. The UI name is confirmed, internal enum choice remains gated by migration audit.

**3. 习惯养成 (habit)** — sustained behavior, not outcome deadline. Minimum form: title + period day/week/month + primary target count or minutes. Optional fixed weekdays/dates, reminder, per-session effort. Default flexible, without booking a whole period in Calendar. Frequency count is entered ONCE. Never ask user to separately check "save period target". If a weekly habit selects execution weekdays, distinguish *eligible/preferred days* from goal count; do not silently override a deliberately entered target or auto-label missing check-ins failures. Persist metric and period consistently.

**Description vs Notes:** `todos.description` is a short optional task summary only. Actual working notes are `quick_notes`, grouped Todo-level into Unsorted / subtasks. Never create a duplicate free-form "remarks" data model.

**Completion continuation:** after a one-time or planned project is completed, show non-blocking optional feedback: `再做一次` / `定期继续` / `养成习惯` / dismiss. Any continuation creates a NEW Todo linked through nullable `origin_todo_id`; the completed original and its Focus history remain immutable. "定期继续" language should be reviewed to avoid reusing the deadline-project label for repeating a series.

**No unintended data loss:** test data is still in a live Production-backed environment until independently established otherwise. Even if user volunteers to delete test records, inventory references, copy verified backup, review exact affected records, test destructive SQL on Staging and secure explicit confirmation for the particular migration. Do NOT drop the old recurrence tables simply because the new creation UI does not expose recurring duties; existing features or history may still depend on them.

**Migration gates:** inspect current Production and Staging schema, row counts and policy/function definitions, confirm deployment refs, then choose lowest-risk additive design or reviewed replacement. SQL files committed to GitHub are NOT executed automatically. The priority is updating the creation UX and preserving Todo/Calendar/Focus/Quick Notes mappings, not prematurely minimizing table count.

## CONFIRMED IMPLEMENTATION STRATEGY — 2026-10-12 (latest, overrides earlier Calendar alternatives)

**Primary interaction:** Create outcome first; arrange execution later. Keep the approved three-column desktop layout: categorized task list / selected task workspace / optional Todo-level Quick Notes ~380px. Right-side creation drawer short, no obligatory "advanced planning" form. Description (short task requirements) and category are visible before type-specific settings; Quick Notes are working notes, NOT a second description/remarks field.

**Three creation paths:**
- **单次任务:** title only required; optional short description/category, no forced "Today" execution. "Today" is only a view, not a task type or recurrence rule.
- **定期任务:** one deliverable within a finite period, NOT automatic recurrence. Default plan_start_date to user's local **today**, editable. User picks target_finish_date; optional independent deadline_date. Creation stores a single Todo with plan dates (currently database task_type=one_time plus plan fields), not new task series. Detailed steps and scheduling happen in workspace. Planned task automatically receives optional-system Journey visualization with identical plan start/target finish dates; no extra "Enable Journey" checkbox or second date range. Color token persisted in goal_journeys.color_key.
- **习惯养成:** sustained behavior, target per day/week/month entered ONCE, count or suitable metric. If choosing **fixed weekdays** within a week, weekday selection **determines and auto-saves** weekly count, never ask for a redundant number. If choosing flexible weekly count, user enters N and picks no fixed weekdays. Missing check-ins do not auto-fail. Underlying legacy RPC currently restricts daily and weekly quota; day-many/month must not silently claim support prior to migration.

**Creation vs execution scheduling are separate:** After creation select the new Todo in Task Workspace; no forced second wizard. Within Workspace / Schedule tab, **Arrange execution** with modes:
1. **Flexible**: optional planned effort (e.g. 45m); no specific date/time booking.
2. **Time window**: preferred execution window (e.g. 18:00–22:00) plus intended 45m effort, not a 4-hour reservation or actual time.
3. **Fixed time slot**: explicit start/end datetime, a real booked Todo Session.
Optional Steps are linked to the same Todo; any mode may be associated with a subtask as appropriate. Focus logs actual time; estimates and window sizes must NEVER inflate actual focus totals.

**FINAL CALENDAR RULE:** Calendar **hourly grid renders ONLY fixed booked time slots** from todo_sessions (with legacy todos.scheduled_start/end compatibility during migration). **Flexible tasks and time-window preferences do NOT display in the Calendar hourly grid OR all-day row.** Fixed weekdays for habits alone must NOT place bookings on Calendar; need explicit start/end time. Journey coloring in its separate Journey mode is independent from hourly Calendar session filtering. Today / task list can surface relevant to-dos without creating events. Remove old virtual recurring/calendar rule indicators from hourly grid once dependencies are verified.

**Task Workspace:** Steps | Schedule | Stats | Details tabs. Quick Notes optional third column stays Todo-level grouped Unsorted and steps. Performance/Stats computed from habit_logs/focus_entries/real outcomes; users don't manually enter performance at creation. Journey and date settings in Details, not duplicate advanced creation fields.

**Data contract/migration sequence:** Preserve todos, todo_subtasks, todo_sessions, quick_notes, focus_entries, habit_logs, task_goal_settings, goal_journeys; audit schedule_rules/task_occurrences and legacy readers/RPC before removing anything. Production and Staging V3 M1 plan_start_date/target_finish_date/deadline_date have reportedly been successfully applied by user; verify actual schema before deploying further changes. Do not invent a "flexible calendar event" or store 18:00–22:00 as a 4h booked todo_session. Prefer one minimal execution-plan table keyed to Todo (and optional subtask) for flexible/window metadata if needed, with strict modes and date/window constraints, rather than stretching todo_sessions semantics. No change to Production without independently tested and approved migration.

**Execution order:** (1) Workflow source of truth, (2) read actual schema/code dependency and minimal migration proposal, (3) implement Workspace arrange-execution UI+data on feature branch, (4) build and Staging E2E, (5) user approves Production.

## Product promise
**Plan lightly. Progress freely.** Capture immediately; plan in proportion to complexity; never punish unfinished work. Missing a scheduled slot does not delete, fail, or automatically complete a Todo. Reminders are gentle, opt-in, and eventually state-aware.

## User journeys, not additional database task types
1. **Get something done**: a one-time result, from “buy milk” to “write thesis”. Only a title required; optional planned day, target completion date, external deadline, estimate, steps and sessions. Duration does NOT determine completion.
2. **An appointment / event**: a one-time Todo with an explicitly booked Calendar session, optionally a relative reminder. Do not force effort goals or subtasks.
3. **Do something regularly**: `recurring` for independent due occurrences (weekly report, rent), `habit` for behavior check-ins and period goals (running). Habit absence is not automatically failure. Do not treat a weekly quota as four fixed reservations.

Database task_type remains ONLY `one_time | recurring | habit`. “Event” and “complex project” are creation paths, NOT new types. Journey and pet systems are optional layers, NOT task types.

## Capture > decide > execute > record > adjust
- **Capture (default)**: title only; no mandatory date, duration, category, Journey or pet. Default destination should be Inbox/Unscheduled **once schema and readers support null/unscheduled dates**. Until audited, do not write invalid null dates or silently change production storage semantics.
- **Decision, if needed**: type, “when?”, or “help me plan”. Avoid full-screen wizard / long forms. Open type-specific details only on request. Optional steps are added after saving the parent Todo; Quick Notes remain Todo-level panel.
- **Calendar**: task date (“intend to work on day”), target finish day, true deadline, fixed session, and flexible availability window are distinct meanings. No artificial deadline for buying milk. Booked session duration is NOT total task effort. Window duration is NOT booked labor.
- **Time math**: if start and duration are known, compute end. If end is adjusted while duration remains the user-chosen anchor, compute start. Support cross-midnight and timezone. Confirm on submit that fixed future booking is not already elapsed; past task dates must not be blanket-banned because backlogs/history exist.
- **Execute**: user can start Focus without a calendar reservation; 70-minute estimate may be completed across many 15-minute intervals. Completion requires explicit outcome.
- **Record/adjust**: actual `focus_entries` are immutable observed intervals; `todo_sessions` are intention. Rescheduling never mutates actual history. A missed plan is editable and not a failure.

## Display contract / progressive disclosure
| Surface | Default primary purpose | Show only when relevant |
|---|---|---|
| Todo / Today | What can I do? Capture and act. Category grouping and eligible recurring/habit entries. | steps, notes, schedule preview, Journey link |
| Calendar Day | What time is committed? Booked sessions / appointments; light reminders. | overlay actual intervals in an explicit Compare mode |
| Calendar Week | Workload and planned time; distinguish recurring obligations from habit goals | actual overlay |
| Calendar Month | sparse day markers, milestones, compact Journey-colored in-cell ranges | details on click, not every Focus event |
| History | created/completed events, confirmed outcomes, exact actual intervals | plan revision audit as implemented |
| Statistics | derivations from actual facts vs optional planned expectations | no invented zero-data failures |

Calendar has three *display layers*, not three new tables: **plan** (sessions/rules), **actual** (focus/habit logs), **milestone** (target/deadline/Journey). Default to plan and relevant milestone; actual shown via deliberate toggle. Avoid confusing a Journey's elapsed calendar fraction with verified work progress. Multiple Journey ranges may overlap with stable user-selected `color_key`.

## Semantics by type
- `one_time`: parent completed once; zero-to-many `todo_subtasks`, `todo_sessions`, `focus_entries`.
- `recurring`: parent represents series; `schedule_rules` defines cadence, `task_occurrences` identifies each outcome. Never mark parent complete when a single occurrence completes. Weekly quota has no automatically booked weekdays.
- `habit`: `task_goal_settings` defines frequency/time goals; `habit_logs` records check-ins. Optional time hints and conditional reminders, no compulsory booked slot. Avoid double-counting focus + manual logs.
- `goal_journeys` + `goal_journey_days`: optional motivation/visualization, NOT calendar booking; animal identity and future companion/pet growth need separate reviewed design. Do NOT create a new pet schema in this slice.

## Six core operations / write ownership
| Operation | Write | Must never do |
|---|---|---|
| Capture | `todos` | create fake sessions, default Journey, AI call |
| Break down | `todo_subtasks` and Todo-level notes | overwrite parent lifecycle |
| Schedule/drag | `todo_sessions` (preserve compatibility with old `todos.scheduled_*` reads) | overwrite focus history or task deadline |
| Start/pause/end | atomic Focus RPC -> `focus_entries` + cumulative compatibility state | auto-complete Todo |
| Finish/check in | `todos.completed_at` for one-time; occurrence or habit log for other types | erase earlier logs |
| Replan | schedule/date intention only; eventually append meaningful change audit | silently change executed sessions |

For statistics retain `created_at`, `completed_at`, execution timestamps, and future material plan changes. Current timestamps are not a full plan revision ledger. No speculative generic activity table until requirements are proven.

## Data inventory / no destructive refactor
**Active, independent:** `todos`, `todo_subtasks`, `todo_sessions`, `quick_notes`, `schedule_rules`, `task_occurrences`, `habit_logs`, `task_goal_settings`, `focus_entries`, `goal_journeys`, `goal_journey_days`.
**Compatibility:** `todos.scheduled_start/end` and `todos.elapsed_seconds`. Keep them until a separately verified migration. Old cumulative seconds cannot be retroactively given fake timestamps.
**Missing/needs audit before schema change:** optional unscheduled dates; target finish vs hard deadline; fixed vs flexible window meaning; optional session→subtask relation; eventual reminders and revision history.
Avoid redundant stored aggregates. Audit current read/write owners and nullability before proposing migrations. Staging first for medium/high risk and RLS; backup/approval before Production, per database workflow doc.

## Implementation slices and acceptance
**Slice 0 — now:** freeze workflow in docs; label recurring obligations vs habit targets in Calendar without creating false sessions; audit actual schema/readers.
**Slice 1 — minimal Todo grounding:** replace long form with title-first capture and type-specific optional controls; preserve current task_date behavior until Inbox/null compatibility verified. User can create one-time, recurring, habit with minimal choices; test persisted results and data ownership.
**Slice 2 — basic Calendar grounding:** one-time explicit booked sessions on Day/Week; recurring due/plan indicators; habit quota/goal as non-booked indicators; one or more Journey ranges displayed as ranges. Never generate dates for weekly quotas.
**Slice 3 — edit and integrity:** task-level edits, optional steps, separate deadline and window where safe; transactional creation where dependent records must save atomically. Risk-classify and test SQL in Staging; do not deploy unverified RPC modifications.
**Slice 4 — comparisons and reminders:** actual-vs-planned overlay, meaningful revision log, conditional reminders with timezone / delivery dedupe. Keep notifications opt-in.
**Slice 5 — optional AI and pet:** authenticated `/api/ai/task-breakdown` produces minimal structured preview of editable subtask suggestions, confirmed by user before persistence; bounded steps/tokens, no background writes. Stats insight endpoint separate. Companion/pet identity is optional, distinct from Journey's animal type; no schema yet.

## Today's realistic shipping goal
1. Verify current branch and migrations; document missing schema rather than guessing.
2. Implement lightweight, honest three-type affordances in Todo and nonmisleading Calendar basic markers.
3. Run build plus task creation / reload / Calendar smoke tests against explicitly verified environment. If schema compatibility blocks Inbox or goal UI, retain current behavior, document blocker, and request migration approval rather than running SQL.
4. Never claim a UI commit proves data-layer functional testing. Keep all work in feature branch until acceptance.

## Operational references
Read `docs/task-architecture-v2.md`, `docs/calendar-architecture-phase-a.md`, `docs/database-environments-and-migration-workflow.md`. These older docs capture migration decisions; any outdated TODO “not yet migrated” statements must be validated against actual database before acting. This workflow supersedes older **UI interaction** proposals where inconsistent.
