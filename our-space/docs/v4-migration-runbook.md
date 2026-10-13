# Our Space V4 — Migration runbook (Phases 1–4)

Every migration below is **written and tested against a local PostgreSQL stand-in, but has not been run on
Supabase**. Each file starts with the same sections: 影响范围 (scope), 身份与幂等 (identity and idempotency
rules), 前置条件, 只读预检 (read-only preflight), 备份要求, 执行顺序, 回滚. Read the file header before running it.

## Order

| Step | File | Kind | App code that needs it | Can run before the app is deployed? |
| --- | --- | --- | --- | --- |
| 0 | — | Backup | — | Supabase backup newer than 24h, plus the preflight outputs saved as files |
| 1 | `supabase/v4_10_completion_events.sql` | Schema + RPC | Phase 1 (check-in, Focus “完成一次”) | Yes. Old app keeps working; the old Focus RPC no longer completes routines |
| 2 | `supabase/v4_data_fix_routine_status.sql` | **Data only** | — | Yes, after step 1. Restores wrongly completed routines; keeps a snapshot table |
| 3 | `supabase/v4_11_series_identity.sql` | Schema + RPC | Phase 2 (series menus) | Yes. Old app ignores `batch_id`; the default fills it |
| 4 | `supabase/v4_12_date_only_tasks.sql` | Schema + RPC | Phase 3 (先不定 date choice) | Yes. Without a `task_date` key the RPC behaves as before |
| 5 | `supabase/v4_13_schedule_integrity.sql` | Constraints | none | Yes |

Deploy the app (this branch) after step 4 or 5. Before then the app detects missing pieces and says which
migration is needed instead of failing silently (`v4_10` for check-ins, `v4_12` for undated tasks; series
actions fall back to per-slot calls until `v4_11`).

## For each step

1. Run the file's **只读预检** queries; compare with the expected results written next to them. Stop if a
   “must be 0 rows” query returns rows.
2. Save any output the rollback needs (function definitions marked P3/P4/P6).
3. Run the whole file in the Supabase SQL editor. It is one transaction: on any error nothing changes.
4. Run the **验证 / Post-checks** at the end of the file.
5. If something is wrong, run the rollback block for that file (newest first if several were applied).

## Identity and idempotency rules (apply to all writers)

| Thing | Identity | Repeated request |
| --- | --- | --- |
| Completion event | `habit_logs.id` | same `client_event_id` → same event (`log_completion_v4`); undo by id is a no-op the second time |
| Completion from Focus | `focus_entry_id` (unique) | same focus interval + key → same event |
| Dated plan | `todo_sessions.id` (client-generated on insert) | retried insert with same id → recognised (23505), not duplicated |
| Repeating series | `batch_id` (one save) → `slot_key` (one slot) → `id` (one version) | batch RPCs update in place when re-run; versions of one slot cannot overlap (DB constraint) |
| One occurrence change | `(todo_id, slot_key, occurrence_date)` | upsert on that key |

Identity is never inferred from timestamps or matching times. Existing templates get `batch_id = slot_key`
(each slot alone); only new saves create multi-slot batches.

## Testing the migrations locally

```bash
# any throwaway PostgreSQL 14+ with btree_gist; never Supabase
PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres our-space/supabase/tests/run.sh
```

`run.sh` builds a minimal Supabase stand-in (`auth.uid()`, roles, owner RLS), applies the existing
M7 / focus v1.1 / save_task_v4 definitions, then for each migration: runs it **twice** (re-runnable),
runs its SQL tests, and finally executes every rollback block newest-first. Covered: idempotent
completion, several completions per day, undo, owner isolation, Focus link and legacy RPC safety,
data-fix + its rollback, slot-only vs whole-batch revision, independent identical series untouched,
history protection, overlapping versions refused, undated/date-only tasks, notes kept on step deletion,
fixed overlap refused while touching slots, other tasks, windows and swaps are allowed, and exact FK
restoration on rollback.

## Not covered yet

- Timezone of stored plans still follows the browser, not the profile setting (B07).
- Day view: clicking a repeating event still opens the task page instead of editing in place (D04).
- Duration goals for routines (“180 minutes a week”) are deliberately postponed; only count goals are live.
- Snapshot table `v4_fix_routine_status_snapshot` and `v4_13_saved_constraints` can be dropped in a later
  cleanup once the release is confirmed.
