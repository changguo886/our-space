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
