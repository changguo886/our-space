# Todo V4 UI architecture / Calendar interaction contract
Status: approved design baseline; implementation in progress on feature/v4-todo-ui. Do not interpret this as deployed schema or tested behavior.

## Responsibilities
- Todo owns task creation, type, category, checklist, execution editing, note workspace, focus launch.
- Calendar displays and reschedules plans; Today provides a light overview, not a second comprehensive task editor.
- All user-facing text follows existing Settings-managed I18nProvider. No language switch in Todo. Chinese text in zh-CN, English-only UI copy in en.
- AppDatePicker (components/ui/AppDatePicker.tsx) accepts ISO YYYY-MM-DD values, renders localized format and lets users type directly or click an icon to open a calendar. Neither interface requires a mode switch. Reuse it in Todo and Calendar.

## Task creation and completion
- one_time: quick title/category creation; no forced execution booking. The current NOT NULL task_date is a compatibility issue requiring reviewed migration before truly undated tasks are promised.
- project: parent task has plan_start_date/target_finish_date and optional deadline_date; actual booked work may recur, completion of project does not.
- routine: period and goal rule (flexible N per day/week/month OR fixed eligible dates) are independent from execution times. Same-day multiple actual completions are distinct events, not per-session assumptions.
- Routine actual completions require a confirmed persistent event service. focus_entries records actual time, never synthesize them from check-ins.

## Scheduling editor
- First choose application scope: one date; recurring defaults (entire/future series); or custom weekday/month-day presets.
- Then choose timing mode: fixed clock start/end; window plus intended minutes; flexible minutes without clock placement.
- Repeat scope and timing mode are independent. A fixed weekday does not imply a fixed clock booking.
- Uniform default: one time configuration applies to all eligible selected dates, without materializing future sessions.
- Custom: multiple slots on same weekday/month-day, optional copy to other dates. Preserve unique slot_key and explicit replaces_slot_key for replacement rather than accidental addition.
- Flexible quota (e.g. weekly 3 at any dates) remains an unallocated period quota in Calendar. It is NOT three future timestamp bookings, NOT three completion events, and should not occupy hourly grid.
- Calendar shows unallocated remaining count; when the user actually schedules an instance, persist one appropriate todo_sessions row. Completed sessions stay in history rather than disappearing from storage.
- Future series editing must have a confirmation and effective date. One-off edits via overrides do not rewrite earlier history.

## Task type conversion
- A guarded conversion review: list current/future sessions, recurring templates, completion history, notes, focus, Journey. Preserve historical facts. Future single bookings can generally survive; future recurring templates require explicit user decision.
- Current save_task_v4 does not support arbitrary cross-family conversion; no fake enabled conversion button before RPC/service implementation.
- With meaningful completion history prefer a new linked Todo via origin_todo_id, preserving original record.

## Desktop layout
- Compact category navigation; center selected task/steps/execution/focus workspace; collapsible Todo-level Quick Notes right rail 360-420px, nominal 380px.
- On mobile Notes opens as an independent drawer. Deleting Subtask SET NULLs associated Quick Notes to Unsorted.
- Progressive creation: after initial save offer Add Steps, Plan Execution, Open Notes; never force complete schedule form.

## Acceptance gates
- I18n all functional buttons/labels/toasts/errors and date/calendar surfaces.
- Manual date typing, picker selection, leap days/month-end, min/max, timezone, keyboard.
- Three V4 types and All Tasks filters; category grouping.
- Single/day/week/month and multi-slot templates; fixed/window/flexible consistency; duplicate suppression and one-off overrides.
- Quota view versus actual booking and actual completion, including multiple completion events/day.
- Two-account RLS, Web/Tauri Focus and Notes, mobile regression, rollback/backup before DDL.
- Calendar redesign deferred until Todo V4 UI verified. Do not merge to Main automatically.
