# Our Space — Task Architecture V2 & UX Plan

Status: **Product architecture accepted; implementation details pending verification** (2026-10-12)
Branch: `feature/task-model-v2`
Related decisions: `docs/calendar-architecture-phase-a.md`, `docs/database-environments-and-migration-workflow.md`.

## Core principles

- **Three task types only**: `one_time`, `recurring`, `habit`. A long-term Journey is **not** a fourth task type.
- **Different concepts**: type = completion semantics; category = work/study/life/rest/other; schedule = when planned; Journey = optional motivational layer; pets = future identity/appearance layer.
- **Low-friction default**: users may try something once without committing to a routine. Never create future reservations or enable a Journey without opt-in.
- Todo manages task and subtasks/Quick Notes; Calendar manages scheduled Sessions and overlapping Journey ranges; History/Record manages executed facts and analysis. Do not conflate planned with actual time.

## Type semantics

| Type | Completion | Persistence |
|---|---|---|
| One-time | Complete once, parent Todo stores completion | `todos`, optional `todo_sessions` |
| Recurring | Each occurrence completed/skipped independently; parent represents continuing rule | `todos`, `schedule_rules`, `task_occurrences` |
| Habit | Track actual behaviors and period goal attainment; missing check-in is not automatically a failure | `todos`, `schedule_rules`, `habit_logs`; target metrics need final spec |

- Existing `todos.scheduled_start/end` remain for backward compatibility with Calendar. `todo_sessions` are planned blocks, not execution history.
- Habit target metrics need explicit representation for count vs total duration; do not silently redefine `estimated_minutes` as a weekly goal.
- `task_occurrences.schedule_rule_id` must belong to the same Todo as the occurrence; verify/enforce before production feature use. Instance identity and rule edit exceptions require documented handling.
- Current V2 DB migrations (`task_model_v2_phase1.sql`, `task_model_v2_phase2_create.sql`) provide initial schema/RPC, **not** the entire occurrence engine, habit goals, or Journey progress calculations.

## Today, Calendar, History

- **Today:** group today's eligible items by Category. Within each section: running, pending, paused, completed; completed today may collapse. Future and historic completed items do not enter today's active list. Past uncompleted items retain a separate compact overdue entry, not silently discarded.
- For recurring: derive today's relevant occurrence from schedule, not the parent `todos.task_date` alone. For habit: distinguish eligible to check in from due/booked. Do not double-count parent and occurrence.
- **Remove the separate `AllTasksWorkspace` block** from Todo; keep History/Record as the all-time browsing and category/type analysis surface, and Calendar as forward planning.
- **Calendar Month/Journey:** multiple ranges shown as color-coded solid timelines **inside date cells**. Each Journey's color is user-selected and stable; selecting one opens that animal/route's presentation. Editing boundaries uses preview + Confirm/Cancel, without silently moving sessions or changing history. Color-vision pattern mode is deferred to future Settings.
- Journey is optional motivation for ongoing goals and deliberately long-range one-time projects, not a compulsory checkbox on routine one-time tasks. A Journey's target date and a recurrence rule's end date are independent.

## Accepted UX: After completion → What next?

**Purpose:** help users grow from a one-off, low-pressure trial into continuing practice. It is not an in-place rewrite of a completed task.

Upon finishing a one-time task, offer a subtle, dismissible, non-blocking affordance (`接下来想怎么做？` / `What next?`):
1. **再做一次 / Do it again** → prefill a *new* one-time Todo.
2. **定期继续 / Repeat regularly** → open a concise recurring-plan setup; create a *new* recurring Todo with its schedule rule.
3. **养成习惯 / Build a habit** → open a concise habit-plan setup; create a *new* habit Todo with a recurrence/goal configuration.
4. **先这样 / Not now** → dismiss; original completed Todo is preserved.

A full modal must **not** appear after every completion. The user can reach `基于此任务继续 / Continue from this task` later in task detail or History. A suggestion is optional and never automatically schedules future sessions.

### Lightweight plan setup (about 3–4 decisions)

- Mode: regularly repeat vs build a habit (prefilled by entry action)
- Pattern/frequency: every day, selected weekdays, or N times per week
- Start date: default next suitable date; end date optional
- Optional execution target/time: per-session estimate or habit target; advanced settings expandable

Prefill title, category, description and useful duration from the original task. Show a concise summary and confirmation before writing. Do not automatically create a Journey or assume the user wants an intense daily goal.

### Data provenance and history integrity

- **Completed task stays completed**, with its actual completion time and Focus history untouched.
- Continuing creates a **new Todo**, optionally linked to the originating Todo through a future nullable `origin_todo_id` (proposal, **not yet migrated**). The link supports displaying `started from one try` and prevents mixing completed one-off history into habit/occurrence stats.
- Do not automatically count the original one-time completion toward the new habit's adherence denominator or numerator; the new routine's measurement starts at its own rule start date.
- Prevent accidental duplicate creation from repeated submit actions. Define behavior for multiple legitimate continuations later.
- For a not-started Todo, editing task type may be supported; for already completed Todos, use `Continue from this task` rather than editing the task's historical type.

## Journey and future pets

- Keep `goal_journeys` and `goal_journey_days` independent of actual habit/occurrence/Focus records.
- Current unique `goal_journeys.todo_id` means zero or one Journey per Todo, while many Todos/Journeys can coexist in the month grid.
- Future pets can be assigned to Journeys without treating `goal_journeys.animal_type` as a permanent pet identity; exact pet schema deferred.
- Journey dates represent active visual range, **not** an obligation to work every single day. Journey completion/chapters must not automatically stop a recurring rule or habit.

## Implementation order

1. **Design gate:** confirm task creation/edit fields and recurrence/habit target meanings. Fix Today schedule editor bug. Do not deploy incomplete V2 to production UI.
2. Simplify Todo page: remove `AllTasksWorkspace`, add category grouping/filtering inside `TodayTodoWorkspace` without losing Quick Notes behavior.
3. Make type-specific create/edit forms with localized date picker and clear start/end versus recurrence-rule meaning.
4. Complete occurrence and habit target data contract, constraints and authenticated RLS tests; any schema changes are versioned and risk-classified before Production.
5. Implement Today due/eligible instances, occurrence completion and habit check-ins; connect to History/Record.
6. Add optional post-completion `What next?` entry and 3–4 choice continuation flow. Decide/implement `origin_todo_id` when building it; preserve old task history.
7. Calendar multi-Journey in-cell colored ranges, selected Journey, range editing, user-selected colors; then future pet integration.
8. Build, regression test, review and merge; never assume GitHub SQL was automatically executed against Supabase.

## Outstanding decisions before claiming DB design is fully finished

- Habit goal contract (count vs total duration, daily/weekly period, units).
- Occurrence key, same-Todo rule integrity, cancellation and edit-this/series exceptions.
- Parent status vs occurrence status transitions for active/paused/ended recurrence.
- Provenance key `origin_todo_id`, optional selected Journey color storage and any rule-target migration.
- Exact localized date-picker implementation and UI detail screens.

**No SQL or Production migration is authorized merely by this document.** Implement only after reviewing remaining data contracts and risk.
