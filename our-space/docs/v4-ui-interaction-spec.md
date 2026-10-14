# Our Space V4 — UI Interaction Specification v0.1
Status: design draft; no UI code or DB changes. Read with v4-data-interaction-codebook.md and v4-product-blueprint-roadmap.md.

## 1. Information architecture
- Sidebar: Today, Upcoming, All Tasks, Calendar, History, Space, Settings.
- All Tasks: group by category work/study/life/rest/other, with All and per-category filters; completed tasks accessible separately.
- Workspace desktop: left compact navigation | central Todo / Steps / Execution | collapsible right Quick Notes, about 380px (360–420px), not equal thirds. Tablet/mobile use notes drawer.
- Tauri Focus Companion stays independent compact UI over shared schema/data access.

## 2. Create Task — progressive
Shared: title required; description, category/custom tag, private/Space visibility optional. Type required.
ONE_TIME: no scheduled date required as product goal; currently DB task_date NOT NULL, so UI must keep compatibility until migration. Deadline optional and different from a booked session.
PROJECT: plan_start_date and target_finish_date required, deadline_date optional (not before target unless product decision revisited); Journey color optional. Never mark project complete because date elapsed.
ROUTINE: period day/week/month; arrangement fixed/flexible; target_count; weekdays[] ISO1..7; month_days[] 1..31 plus month_end; starts_on/ends_on; strict flag. For flexible weekly N, don't create N calendar bookings. For fixed monthly 31 skip absent day; month-end dedupe.
After creation, offer Add Steps / Plan Time / Open Notes. Do not require these to create parent Todo. Underlying save_task_v4 currently handles task + rule; Journey is a separate write and must have failure recovery before UI claim of atomic creation.

## 3. Edit and transition
- Inline changes: title, description, category, task-specific dates/rule, opt-in visibility, per-step estimates. Save / Cancel / error / retry.
- save_task_v4 is canonical create/edit. Current cross-family conversion is blocked. Design a separate confirmed conversion flow: preserve Notes/Sessions/Focus; if historical completions make conversion ambiguous, fork a linked new Todo via origin_todo_id instead.
- For completed work continued later, default create a new linked task, never silently un-complete historical work.
- Never update a series of sessions when user selected only one occurrence.

## 4. Execution scheduling
ONE-DAY modal/drawer: chosen date, mode fixed/window/flexible. Fixed requires scheduled_start/end (timezone display); window requires plan_date, window_start/end, planned_minutes; flexible requires plan_date and planned_minutes. Only fixed occupies hourly Calendar.
REPEATING template: selector all/weekday/month_day/month_end, effective range, time mode, optional replaces_slot_key; exception controls This date / This and future / Entire series. Keep virtual expansion (do not insert months of future sessions).
UI collision handling: show overlapping fixed slots; block invalid backwards time; make replacement explicit; distinguish plan from actual Focus time.

## 5. Today / Calendar / History
Today task card: title, category, type, due/target if meaningful, Steps progress, note count, planned effort, completed state; expandable execution summary. Buckets Today/Upcoming/Backlog/Completed/All; category grouped view and total count.
Calendar day/week/month: fixed sessions + fixed templates in timed grid; flexible/window visible as unbooked agenda items, never fake clock events. Day timezone respects profile/user preference and DST.
History: completion events and focus_entries kept as separate timelines/metrics; routine per-occasion count not inferred from one boolean.

## 6. Todo detail and Quick Notes
Central: task title/type/status; Steps checklist reorder, create, complete, delete; execution plans and templates; Focus CTA and Journey when project.
Right: Todo-level Notes only, once load by todo_id; sections Unsorted then Step1..N, count and Add in each. Note optional title, content, color, edit/delete/move. Delete subtask SET NULL -> Unsorted. Later DnD reorder and section jump.
Do not render inline Notes under each step.

## 7. State & interaction inventory
| State | Scope | Owner | Behavior |
|---|---|---|---|
| selectedTodoId | page | TodoList/parent | route/panel selection; clear if task removed |
| notesOpen / notesTodoId | page | TodoList parent | one right-side panel per selected Todo |
| taskType | form | Add/Edit | one_time/project/routine |
| categoryFilter / typeFilter | task board | Today/All Tasks | persist/filter without changing data |
| dateRange / timezone | agenda | Today/Calendar | one consistent canonical date expansion |
| executionMode | scheduler | Schedule UI | fixed/window/flexible |
| effectiveScope | template editor | Schedule UI | once/future/all with confirmation |
| loading / saving / error | each form | component | prevent duplicate submit; retriable failure |
| notesSection / subtaskId | Notes | QuickNotes | NULL=Unsorted; owner check via todos |
| completionEventId | history (future) | completion service | durable single event identity |

## 8. Critical UX states and accessibility
Empty Today/All, no Steps, no Notes, unscheduled task, no Journey, loading, optimistic save failure, RLS denied, lost network/offline Desktop, stale multi-device edits. Keyboard accessible notes move and step reordering; confirm destructive removal. Never claim success before write confirmed.

## 9. UI acceptance scenarios
1. Create one-time without scheduled time (compatible interim date required until schema adjusted).
2. Create project, verify Journey and separate deadline; edit project without deleting Notes.
3. Create routine weekly flexible 4, record counts without booking fake times; fixed monthly 31 and month-end.
4. Add one fixed, one flexible, one window session: only fixed on timed Calendar.
5. Cancel/change one generated occurrence vs future series without duplicate.
6. Delete subtask: its Notes move to Unsorted.
7. Complete Todo, log focus independently, then continue as linked next task.
8. Verify privacy with two accounts and Tauri Focus.
9. Validate Save/Cancel/Retry behavior and DST timezone boundary.

## 10. Decision points before implementation
- Completion event uniqueness/count behavior, especially multiple completions per day.
- Strict routine overdue & skipped semantics.
- One-time undated DB migration and Today backlog behavior.
- Safe type conversions and rule/history retention.
- Project/Journey date policy consistency.
- Shared agenda API return type and recurrence template precedence.
- Exact responsive breakpoints and mobile Note drawer behavior.

Do not remove legacy-compatible fields until each corresponding consumer is migrated and tested.
