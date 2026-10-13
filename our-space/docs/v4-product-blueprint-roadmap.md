# Our Space V4 — Product Blueprint and Roadmap
Status: design draft for discussion, not implemented feature inventory. 2026-10-12.
Companion: docs/v4-data-interaction-codebook.md.

## North star
A day-centered personal planner with a friendly Space for sharing daily progress. A task is an outcome or recurring commitment; steps break it down, sessions plan work, Focus records actual effort, Quick Notes preserve context, Journey visualizes progress. Keep these meanings distinct.

## Minimal V4 UI draft
Desktop Web 3-column workspace: compact navigation/category filters | selected Todo detail and Subtasks / execution plan / Focus | collapsible 360–420px Quick Notes panel (default 380px). Sidebar and central workspace share remaining space; NOT equal thirds.
Views: Today (what is eligible or planned for this day); Upcoming (future plans); All Tasks (category-grouped and comprehensive view); Calendar (fixed timed bookings and virtual fixed sessions); History (actual completions and focus); Space sharing and daily entries; Settings; Focus Companion separate UI.
Add Task progressive flow: choose one_time/project/routine -> title/category/optional Space visibility -> type-specific minimum -> create -> optionally add steps, recurring time templates, day plans, Quick Notes, Journey, reminder. Do not force minute estimates for one-time tasks.
Edit Task: in-place details and type-specific controls. Conversion needs an explicit semantics/confirmation policy; currently disabled, not a finished feature. An already completed task continues by a new Todo optionally linked via origin_todo_id.
Notes Web right panel grouped Unsorted/each subtask, with counts, add/edit/delete/move/color/title. Phase B section drag/drop, jump to step. Tauri notes independent compact interface.

## Interaction journeys
1. One-time: capture without scheduled date -> optional schedule or deadline -> perform -> complete. Current todos.task_date NOT NULL prevents truly undated persistence: future migration required.
2. Project: select start/target finish (+ optional independent deadline) -> create Journey -> day-level plans and subtasks -> actual Focus -> complete once. Journey passage is never automatic task completion.
3. Routine: choose day/week/month, flexible N vs fixed week/month selectors, starts/ends and strict mode -> completion events over time -> history/statistics. For monthly 31, skip absent days; month_end dedupe.
4. Schedule: choose once or repeating, fixed/window/flexible. Only fixed is a clock booking on Calendar. Template revisions are scoped this occurrence / future / all as separately defined user operations.
5. Completion and focus: record actual completion and actual duration separately. Repeated completions need individual event identity, not merely one boolean per Todo.
6. Collaboration: retain Space membership, daily check-in, photos/videos, reactions and comments independent from private Todo data.

## Functional portfolio and priority
| Area | Baseline now | Next design/development | Later |
|---|---|---|---|
| Tasks | create/edit V4 task types, parent status | one-time undated, conversion UX, consistency contracts | richer templates |
| Steps | checklist/order/source | estimate minutes, planned per-step allocation | AI suggestions |
| Scheduling | fixed/window/flexible sessions, templates/overrides | unified agenda read service, timezone tests, revisions | contextual smart scheduling |
| Routine | pattern settings + strict field | completion event model, occurrence edits, overdue semantics | analytics, streaks |
| Focus | timer, actual focus_entries model | idempotency and reconnect tests on Web/Tauri | pet-linked rewards |
| Notes | Todo-level panel, content_json/text | note linking/edit consistency & Tauri note regression | within/across section DnD |
| Journey | dates/animal/color/days | reconcile date sources and RLS, hand-authored notes | richer animation |
| Today/Calendar | current separate readers | get_agenda shared logic, day/week/month parity | advanced workload |
| Organization | category + all tasks | grouping/filters/completed history | saved views |
| Social | groups, entries, reactions, comments, media | privacy/permissions regression | shared planning |
| Settings | locale/timezone/preferences | timezone UX localized labels | flexible accessibility |
| AI | source placeholders | propose-only task/step/booking with user confirmation | agent assistance |
| Pets/Rewards | Journey visual concept | deferred: independent reward ledger with idempotent event refs | extensible pet ecosystem |
| Desktop | Tauri Focus Companion | shared data service, independent compact UI | offline queue |

## Milestones and acceptance gates
### M0 — Schema truth & safe cleanup (before design freeze)
- Run read-only live schema probe. Compare with codebook; mark each table ACTIVE / RETIRED / TARGET.
- Confirm v4_07 deployed or not; back up before any actual DDL.
- No aggressive cleanup merely for naming aesthetics.
Acceptance: actual tables and foreign key inventory signed off; no unidentified legacy write caller.

### M1 — Contract and UI design freeze
- Review three task type flows, project deadline distinction, routine strict and completion counts.
- Draft mobile/desktop responsive states, empty/loading/error, Save/Cancel, unsorted notes, timezone.
Acceptance: one UI field maps to one canonical owner and documented RPC/service.

### M2 — Canonical routine and completion schema
- Migrate habit_patterns_v3 -> task_rules and habit_logs -> task_completions with compatible RLS and readers/writers.
- Support event IDs, period/date, completion_at, idempotency; do not fake Focus logs.
Acceptance: owner/nonowner RLS, week/month/month_end counters, edit history tested.

### M3 — Agenda parity and schedule safety
- Unified get_agenda contract for Today/Calendar; no bulk future inserts.
- Fixed only on hourly grid, window/flexible as agenda tasks; override cancellation/rescheduling once.
Acceptance: same day results across Today/Calendar; UTC/DST and template conflicts tested.

### M4 — UI V4 rebuild
- Progressive create/edit flows; categorized task board; Todo center pane and third Notes pane.
- Small-screen adaptation; preserve standalone Tauri Notes design.
Acceptance: build and user task journeys, Notes move/delete/SET NULL, Journey creation intact.

### M5 — QA, rollback and release
- Full npm build + lint/types, Web/Tauri integration, access control with 2 accounts.
- Test backup restore outside production, then controlled migration and deploy.
- Remove final legacy readers/functions only when telemetry and references clean.
Acceptance: written owner sign-off, staged rollout + reversible deployment plan.

## Design decisions that remain OPEN
- What counts as a routine 'completion' when target_count > 1/day; timezone cutoff and backdated edits.
- Strict overdue and missed execution semantics (not merely overdue from no plan).
- Conversion of a completed project to new work, or routine -> one-time: fork vs mutate history.
- How to identify one occurrence for editing vs future series, including overlapping templates.
- Whether planned_minutes is on session, subtask, or both (different meanings).
- Private/Space visibility for Todo vs shared daily entry; no unintended note leakage.
- Focus paused/resumed history, offline desktop sync and client_event_id collision semantics.
- Journey start/target after project rescheduling; preserve handmade journey_day notes.
- One-time date optionality requires schema and reader changes first.
- AI permissions, explainability, human confirmation; reward ledger delayed.

## Data model cleanup policy
NEVER blindly delete all branch-created tables. Keep independent parent/child, note, session, actual effort and social objects. Use additive migration, compatibility read/write period, verified backups, explicit old-reader retirement, and only then restricted drops. Only two tables are confirmed removed from live DB by user (task_occurrences/task_goal_settings). v4_07 legacy pair requires live verification. Names habit_patterns_v3 and habit_logs may remain until integrated rename.
