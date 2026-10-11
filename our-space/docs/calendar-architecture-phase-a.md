# Calendar Architecture Decision — Phase A

Status: **accepted for Phase A implementation** (2026-10-11). This is the repository source of truth for further Calendar and Journey work.

## Clear ownership
- **Todo** answers *what* to do: `todos`, `todo_subtasks`, `quick_notes`. It only links to Journey details; do not embed a full monthly calendar under each Todo.
- **Calendar** answers *when planned*: one planning center with Day / Week / Month / Journey views. Keep existing drag-to-schedule interactions. Journey is the fourth Calendar view, not a new sidebar root.
- **History / Record** answers *what actually happened*: retain historical focus/execution records; do not treat a planned session as completed activity or rewrite historic facts.
- **Companion** is cross-surface identity/appearance and emotional response. The pet should be the same identity across Journey, Calendar, future Mini Focus and Tauri desktop pet; presentation layers can differ.

## Current schema preserved
Keep independent `todos`, `todo_subtasks`, `todo_sessions`, `quick_notes`, existing `goal_journeys` and `goal_journey_days`. Preserve `todos.scheduled_start` / `scheduled_end` until explicit migration. Never re-create a second `long_task_journeys` table.

## Phase A UI and URL navigation
- Calendar view selector: **Day | Week | Month | Journey**. Preserve selected date/month where practical when switching views.
- Day/Week: preserve current working planners. Month: summarize existing planned events, click day to navigate to Day.
- Journey: select a long-term Todo, navigate months, see the journey path, daily state, date details and rest marker. Rest is only a day state, never an automatic calendar reschedule.
- Todo Journey affordance is compact, navigates to Calendar Journey mode and auto-selects Todo and relevant month. Example query contract: `/calendar?view=journey&todoId=<uuid>&date=YYYY-MM-DD`; actual route must be grounded in current repository, not assumed.
- History remains functional and unchanged in Phase A; a future shared month-grid primitive can be extracted when both views are verified.
- Browser and keyboard date navigation; responsive layout and reduced-motion behavior.

## Future: fixed and flexible scheduling (Phase B)
- Both approaches are *scheduling methods of the same Todo*, not separate Todo models.
- Fixed: a timezone-aware recurrence `schedule_rules` with day/week repeat pattern and local start/end/duration; generate or reference `todo_sessions`, retaining individual-instance overrides.
- Flexible: weekly/period goal, user schedules specific sessions manually.
- Editing a recurring instance asks: this instance / this and future / all. Historical executed sessions are immutable to batch plan shifts.
- Preview conflicts before rescheduling; rest never silently shifts future sessions.

## Future: Google Calendar integration
- Phase A defines a provider-agnostic read model but **does not implement OAuth, Google sync, or new production tables**.
- Separate external events from Todos and sessions: do not equate a Google event to an Our Space Todo.
- Read-only availability/events first; outbound publishing next; bidirectional modification last.
- Sync layer later owns source/calendar/event/recurring-instance IDs, cancellation/tombstones, sync cursors, time zones, conflict policies and secured server-side OAuth tokens.
- Never grant browser clients direct provider tokens.

```ts
type CalendarEventView = {
  key: string; // unique even across providers
  source: "ourspace" | "google";
  sourceEventId: string;
  title: string;
  startsAt: string; endsAt: string;
  timezone?: string;
  allDay: boolean;
  editable: boolean;
  todoId?: string;
  sessionId?: string;
};
```

## Shipping gates
1. Ground existing Calendar route/components, no speculative rewrite.
2. Phase A does not generate recurring sessions or change historical records.
3. Existing drag/drop Calendar still works.
4. Month can read scheduled sessions; Journey can read its own days without treating daily labels as sessions.
5. Direct links to Journey select the correct Todo/month; no full calendar in Todo card.
6. Confirm Supabase `goal_journeys_v1.sql` and `goal_journey_days_v1.sql` migration in test DB; never run proposal companion SQL on production.
7. Run `npm run build` and manual browser checks before merge to `main`.

This decision supersedes earlier proposals that expand a full Journey calendar directly inside Todo details.


## Decision: edit Journey dates directly in the month grid (2026-10-11)

**Interaction principle:** the highlighted Journey date cells are the editable surface. Do NOT add a second, separate task bar solely to resize the Journey range.

- Desktop: grab the start/end *boundary cell/handle* and drag to a date; normal click continues opening daily details. Do not make the entire highlighted region draggable in Phase A.
- Touch: long-press the boundary to enter adjustment mode; normal touch and vertical scroll must keep working.
- Continue across months: draft start/end dates survive navigation. Allow month-edge navigation/autoscroll where feasible, but always support manually switching months while draft remains active.
- During drag, preview highlighted days including exact inclusive start/end; days beyond target date are not highlighted. Display existing range, proposed range and an explicit **Confirm / Cancel** step.
- Persist only `goal_journeys.start_date` and `goal_journeys.target_date` after confirmation. Enforce `start_date <= target_date`; show Supabase failures without claiming success. **Do not mutate `todo_sessions`, completed history, or `todos.scheduled_start/end`** as a side effect.
- Show a warning if existing planned Sessions fall outside proposed Journey dates. The warning does not silently replan them.
- Offer accessible date-picker/manual date-entry fallback and keyboard interactions.
- Phase A must work for ranges spanning months and years, including days outside the range.
- Separately audit semantic mismatch between Todo deadline and Journey target date; do not silently equate or sync them. They are independent until an explicit user choice and migration policy exists.

### Explicitly deferred to Phase B: workload semantics and rescheduling

There are **three independent dimensions**:
1. **Date range:** calendar boundaries (Journey start/target).
2. **Workload:** total target hours vs habit/routine target per session.
3. **Session schedule:** exact booked slots, fixed recurring or flexible manual.

Workload calculation is *not* implied by resizing dates. After resizing, future UI may offer:
- **Keep total workload, redistribute remaining hours.** Example: 20 total hours, 10 available days = 2h/day; shrink to 5 available days = 4h/day only if none completed. Correct general formula: `remaining_hours = max(0, target_total_hours - verified_completed_hours)`; `daily_suggestion = remaining_hours / remaining_available_work_days`. Exclude rest/non-working days; respect timezone and already-completed history.
- **Keep per-day/per-session effort**, possibly reducing total planned occurrences/amount (especially important for habit/physical exercise tasks).
- **Change dates only**, leaving booked Sessions untouched and previewing out-of-range exceptions.

Any redistributing, moving future Sessions, or changing total work commitments requires a separate preview with conflict checks and explicit confirmation. Do not automatically turn an edited Journey date into daily work duration, or assume calendar days = working days.

### Scope and acceptance order

1. Verify existing Day planner, newly added Week/Month/Journey shell, Todo deep link and goal_journey_days migration persist after refresh.
2. Verify highlighting actually stops on `goal_journeys.target_date` even when Todo date fields differ; show Journey range plainly.
3. Implement **date boundary preview + Confirm/Cancel + database persistence** in Journey month cells, including adjacent months and date input fallback. Keep normal day-click semantics.
4. Only after robust boundary behavior, consider visual path animation and Companion polish.
5. Keep schedule rules, total-hour allocation, Session shifting, conflict resolution and external-provider sync **out of Phase A**.

Design mantra: **Dragging a date expresses an intention; it never silently rearranges work.**
