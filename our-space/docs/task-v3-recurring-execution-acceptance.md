# Our Space V3 — Recurring Execution Local Acceptance

Branch: `feature/task-model-v2` | Status: **implementation committed; NOT yet locally built, migrated or end-to-end validated**.

## Before testing

1. Use your **test-only Supabase environment**. Do not rerun M3/M4/M5. You confirmed M5 was applied and reported `habit_patterns_v3 = 2`, `task_goal_settings = 2`, `schedule_rules = 0`.
2. Run **in order** in Supabase SQL Editor:
   - `supabase/task_model_v3_m6_execution_scope.sql`
   - `supabase/task_model_v3_m7_template_revision.sql`
3. Each SQL file uses a transaction. Do not run M7 before M6. Report the first SQL error rather than skipping steps. If these files were previously applied, inspect the schema before rerunning.
4. From repository root, switch to the branch and pull latest, then:
   ```bash
   cd our-space
   npm install
   npm run build
   npm run dev
   ```
   This is a **required user-side build**: GitHub code edits alone cannot prove Next.js type-check/build success. Vercel status at the time of coding reported build-rate-limit failures rather than usable build logs.

## Required acceptance scenarios

### A. Repeating monthly dates and Todo buckets
- On a simulated or chosen Oct 12 create a habit for every month 13,14,15 (fixed dates).
- It is **absent from Today on 12**; before booking it is in **待安排**; in **全部** it appears as ONE parent Todo.
- Set `执行安排 → 以后每一次 → 固定时段 09:00–10:00`. Save once.
- Confirm Calendar month/week/day **hourly** shows Oct 13/14/15 and the same days next month. Confirm no future `todo_sessions` rows were inserted for template-generated events.
- Reload and reopen task: template persists and Todo card notes repeating arrangement.
- `即将到来` includes arranged future work and **does not** make the monthly task appear on Oct 12 Today.

### B. Different times and replacement priority
- Under `不同日期分别设置`, choose **每月14日** and select **替换默认 09:00–10:00**. Set 15:00–16:00; save.
- Confirm on 13 and 15 it remains 09:00–10:00, and on 14 there is **only** 15:00–16:00 (not two overlapping defaults).
- If you choose `额外增加一个执行时段` instead, both bookings are intentional.

### C. One-time override, revision and cancellation
- From the saved template, select a particular occurrence date and `仅这次改时间` (e.g. 11:00–12:00). It affects that occurrence only.
- Cancel a single occurrence. Other monthly dates remain.
- Move an occurrence to a **different date** and confirm it appears on the moved-to date, not on the old date.
- Use `从这天起修改` to change series time for future dates. Historical template effective ranges remain and actual Focus/habit logs are unchanged.
- `停止后续` ends the selected template's future range; it must not delete past data.

### D. Daily, weekly, monthly edge cases
- Daily 2 or 3 completions: one parent Todo per day, not N parent cards. Add multiple independent default slots if wanted.
- Fixed weekdays Mon/Wed/Fri: repeated fixed time appears only those days.
- Flexible weekly 3/monthly N: **`以后每一次` without exact rule days must be rejected** to prevent accidental daily bookings. One-off or specific-day scheduling remains allowed.
- Fixed monthly 28/29/30/31 plus `每月最后一天`: impossible dates skip; last-day token matches leap and non-leap February without duplicating the day.
- Flexible plan and preferred time window are *not* Calendar hourly bookings. Exact fixed slots are.
- Finite planned project default slots end at `target_finish_date`; don't turn it into a habit.

### E. Regression checks
- Create/edit habit dates, change counts; refresh to ensure saved.
- Single parent Todo delete, subtasks drag/check/delete, Quick Notes create/edit/delete/move.
- Tauri Mini Focus Notes and start/stop/save actual Focus history; no unintended mutation from recurrence edits.
- Different account cannot read/write another account's patterns, templates, overrides, or notes.
- Verify local timezone and DST transitions; nonexistent spring-forward wall times should not silently shift.
- No duplicates after refresh or repeated save. Some complex time-zone and overlap cases may still require follow-up after real device testing.

## Current scope and known limitations

- **Web** implementation is committed. This is not proof of a successful build, migration, RLS validation, or production deployment.
- Day Calendar displays virtual repeat slots as **read-only** blocks in the hourly grid; clicking routes back to Todo workspace to change the template/override. They are deliberately not draggable like real `todo_sessions`.
- Multi-day recurring exact slots are not supported (single one-off appointments can cross dates). Repeating templates must end on the same local day.
- A flexible weekly/monthly quota alone does not specify a date. It cannot be safely expanded into daily fixed reservations.
- M6 replacement association is a per-template slot link. Validate ownership, template-range overlap, and rule conversion flows in later hardening before public release.
- The time-zone source for execution templates is the client's selected IANA browser zone at creation. Verify UX for users whose configured account zone differs from their browser zone.
- Category filter and collapse behavior are separate from scheduling; confirm both views still work.

## What to report back
1. Whether M6 and M7 each ran successfully.
2. First `npm run build` error (or success).
3. Screenshots or description of A/B/C execution results.
4. Any day-grid duplication, incorrect Today visibility, or Tauri regression.

**Do not merge Main until M6/M7, build, recurrence checks and Mini Focus smoke tests pass.**
