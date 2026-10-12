# Our Space V2 — Progressive Planning Workflow (accepted 2026-10-12)

Status: **Product workflow accepted; incremental implementation underway**. This document is the source of truth for Todo / Calendar / Focus / History semantics. It supersedes earlier assumptions that every Todo must be fully specified at creation. Existing architecture and production migration safety documents remain in force.

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
