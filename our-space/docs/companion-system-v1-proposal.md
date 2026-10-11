# Our Space · Companion System V1 — Architecture draft

Status: **proposal only**. Do not run any SQL from this document against production yet.

## Product rule
One user's animal companion has one durable identity. Journey Calendar, Todo, History/Record, Web Mini Focus and future Tauri desktop pet render the **same companion identity and equipped appearance**, but have platform-specific interfaces.

A journey belongs to an existing Todo and *references* a companion; it is not a second pet. Ordinary month/calendar sessions stay in `todo_sessions`. The existing `goal_journeys` table remains authoritative for long-term journey dates, route, status and settlement. **Do not create `long_task_journeys`**.

## V1 implementation sequence

1. Build read-only companion identity adapter and shared display contracts; default preview can fall back to cat until a companion is selected.
2. Add additive data migration for companions and optional `goal_journeys.companion_id`; never remove `animal_type` legacy field before migration/backfill and dual-read support.
3. Build Journey Calendar monthly view, including selected goal, road/water route, daily state and date detail.
4. Add explicit rest status (no automatic schedule mutation), with separate reschedule-preview flow.
5. Introduce a **server-side idempotent rewards ledger** for completed events, followed by cosmetics and inventory.
6. Adapt same companion avatar and outfit rendering contract to Tauri desktop pet, while keeping independent Web/Tauri presentation.

## Model relationships

- `user_companions`: user-owned pet identity; `id`, `user_id`, `species_key`, `name`, `appearance_config jsonb`, `is_active`, timestamps. Start with one active companion per user; multiple owned companions in future. Ownership cannot be switched via unrelated accounts.
- `companion_catalog`: static species, poses and cosmetic asset identifiers (versioned), not user mood.
- `companion_inventory`: user-owned cosmetic items with stable item key; unique per user and item; purchases must be atomic with deductions.
- `goal_journeys`: existing Todo-linked journey; add nullable `companion_id` later; keep `animal_type` as temporary fallback. A task can choose a companion; default to user's active companion when unbound.
- `goal_journey_days`: `journey_id`, `day_date`, `day_status` (planned / progress / completed / rest / skipped), `note`, timestamps, unique(journey_id, day_date). Rest only changes the day record, not todo_sessions, due date, or long journey target date.
- `reward_transactions`: append-only ledger of earned/spent coins; server-controlled award codes and stable dedupe idempotency keys. No client direct wallet balance updates.
- `companion_event_history` (optional later): persist significant celebrations and cosmetic states for past Record visuals. Do not mistake present-day outfit for historical outfit unless a snapshot exists.

## Appearance contract

```ts
type CompanionAppearance = {
  companionId: string | null;
  speciesKey: "cat" | "dog" | "rabbit" | "fox";
  skinKey: string;
  equipped: { head?: string; neck?: string; accessory?: string };
};
type JourneyScene = {
  route: "swim" | "run" | "hike" | "cycle";
  mood: "idle" | "moving" | "rest" | "hopeful" | "partial-win" | "full-win";
  appearance: CompanionAppearance;
  reducedMotion: boolean;
};
```

Renderers are separate: month-day thumbnail, journey-detail scene, Mini Focus widget and Tauri desktop window. The scene contract is shared. Poses and animations are assets; **randomness changes animation variant only**, never saved task progress or rewards.

## Calendar architecture

Existing Calendar and History/Record are sources of schedule/activity. Journey Calendar is a separate view of `goal_journeys` + day states; user can select month and journey, with a compact multi-journey overview. Journey day clicks open details; on desktop right-click can open the same menu, but normal click and keyboard remain supported.

Two time coordinates: calendar-day progression, actual task completion. Completing 100% earns enthusiastic victory; settling below 100% produces gentle celebration. A user can extend before settlement; an early finish may celebrate immediately.

## Rest and rescheduling

`Rest` writes only a journey-day status and shows a resting animation; it is not punishment and does not grant or revoke points by itself. Rescheduling is a separate explicit action: choose 'only rest', 'move selected session to tomorrow', 'choose another date' or 'preview shifting future sessions'. Show impact and conflicts before any mutation; do not silently shift the entire Todo or use `todos.scheduled_start/end` as if it were the only calendar source.

## Privacy and correctness constraints

All private tables require RLS derived from owner identity (direct `auth.uid()` on user-owned companion; `goal_journey_days -> goal_journeys -> todos.user_id` for journey days). Cross-references must validate that companion and journey belong to the same user. Reward generation must be idempotent and performed by trusted SQL function/server transaction (never blindly by browser). Preserve journal, Quick Notes, and other existing schemas.

## Testing / release gates

- Migrate staging database first; confirm RLS cross-account access fails.
- Keep legacy journeys with only `animal_type` readable.
- Verify two journeys use same companion appearance where selected.
- Test month boundaries, time zones, leap years, rest vs reschedule, stale tab writes.
- Test reduced-motion animations, keyboard date controls and responsive mini view.
- Build and test the feature branch before merging to `main`.

## Non-goals in the first milestone

No starvation, death, upkeep debt, resource penalties, surprise purchases, random reward multipliers, or independent pet copies in each app surface. Do not create currency balances as client-editable fields.
