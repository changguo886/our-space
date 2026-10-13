# V4 schedule review fixes — test notes and rollback

Phases 0–5 (routine completion events, series identity, date-only tasks, integrity) are summarised in
`docs/v4-migration-runbook.md`; this file covers the first review round.

Branch: `fix/v4-schedule-review` (based on `feature/v4-todo-ui` @ 60440db).

## What changed

| Item | Change |
| --- | --- |
| C06 | Past dated plans have no edit/cancel actions; edit checks the **original** date, not the new one. Calendar week/month dialog hides edit/cancel for past events and blocks them in code. |
| A10 | `AddTodoForm` clears the form as soon as the task row exists. A failed color/Journey write shows “重试 / 先这样” instead of letting a second click create a duplicate task. |
| D07 / D06 | Schedule list = repeating series (one row per batch, e.g. “每周一、三、五 · 19:00–20:00”) + upcoming plans in time order; past plans collapsed and read-only. |
| UI | One `⋯` menu per row (修改 / 复制 / 取消; series: 只改某一天 / 从某天起修改 / 停止重复). Mode icons. Dates as “10月14日 周三”. Inline “后面也这样吗？” and “下周也这样？” bars replace the full-screen modal. |
| A07 | Composer per-day rows use Chinese labels and `AppTimePicker`; scope question (“只排这周 / 每周都这样”) moved to the top. |
| A08 / B09 | One rule everywhere (`lib/schedule-utils.ts`): `fixedOverlap` blocks only overlapping fixed slots of the same task; `sameNonFixed` only asks for confirmation when an identical window/flexible plan exists. |
| A09 | Flexible N-per-period shows “目标 N 次 · 已排 X · 还能选 Y” and caps selection. |
| B08 | Multi-select time change is one `upsert` statement (all or nothing). |
| B10 | Inserts carry client-generated ids; a retried request that already landed is recognised (23505) instead of duplicated. |
| C08 / D08 | Failed writes show a 重试 button; successful writes also refresh the page (Today list). |
| Create | “创建” and “创建并安排时间” buttons replace the checkbox. |
| Bug | `AppTimePicker` typed input never parsed (regex was double-escaped); fixed. |
| E02 / E06 | ESLint 9 flat config (`npm run lint`: 0 errors). Unit tests with `node --test` (`npm test`). SQL migration tests in `supabase/tests/run.sh`. |
| D10 / B03 | Moved to `supabase/v4_13_schedule_integrity.sql` (see `docs/v4-migration-runbook.md`). |

## Manual test checklist (Staging or Production)

1. One-time task → 创建并安排时间 → save a plan → “后面也这样吗？” → 选日子 → copy to 2 days.
2. Project → copy a fixed slot to 剩下的工作日 → one series row appears; Calendar shows weekdays only.
3. Routine 每周一三五 → 每周都这样 → change Friday time → list shows one series row; override one Friday.
4. Routine 每周 3 次 → only 3 days selectable; after copying, “下周也这样？” → 沿用到下周.
5. A plan dated yesterday: no ⋯ menu; Calendar dialog has no edit/cancel buttons.
6. Disconnect network, save → 重试 appears; reconnect → retry → exactly one row.
7. Type `930` in a time field → becomes 09:30.

## Rollback

- Code: revert the merge commit of this branch (`git revert -m 1 <merge-sha>`); no schema change is required by the code.
- Database: see `docs/v4-migration-runbook.md`; every migration has its own rollback block.
