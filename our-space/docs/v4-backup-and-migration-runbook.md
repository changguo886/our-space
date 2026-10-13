# Our Space V4 — backup and reset approval runbook

Status: **PREPARED FOR REVIEW, NOT AUTHORIZED TO EXECUTE**.

## Scope confirmed by product owner

Disposable: existing Todo test rows and *their own* Sessions, Subtasks, Quick Notes, Journeys and Journey Days. Counts at last read: 14, 7, 4, 2, 2, 3. Recheck immediately before resetting; do not infer row deletion is safe just from old counts.

Retain: auth.users, profiles, groups/group_members, daily_entries, comments, reactions, daily_entry_media, user_preferences, Supabase Storage and its object metadata; real Focus activity if any new record appeared.

**Foreign-key hazard:** focus_entries.todo_id ON DELETE CASCADE; deleting even one parent Todo destroys associated Focus entries. Also note quick_notes.todo_id and goal_journeys.todo_id CASCADE. A row count of zero at audit time is not proof it is zero on migration day.

## Backup protocol — complete before ANY DDL

1. Record Supabase project reference, database role, snapshot UTC timestamp and migration branch commit (do not publish database credentials).
2. Use the Supabase dashboard's available database backup/restore feature **or** a PostgreSQL custom-format dump using a privileged database connection stored only in local environment. Supabase plan availability varies: do not assume point-in-time recovery exists.
3. For example, on your secure development workstation (NOT inside SQL Editor):
   `pg_dump --format=custom --no-owner --no-acl --file=our-space-before-v4.dump "$DATABASE_URL"`
   Use a directly accessible database URL, not a public anon key. Never share the dump or DATABASE_URL in GitHub/chat.
4. Additionally store schema-only dump: `pg_dump --schema-only --no-owner --no-acl --file=our-space-schema-before-v4.sql "$DATABASE_URL"`.
5. Verify each dump exists and inspect its TOC: `pg_restore --list our-space-before-v4.dump`. **Best proof:** restore the dump to a separate disposable Supabase/PostgreSQL instance and verify core table row counts plus RLS policies, functions and triggers. Avoid restoring into live Production.
6. Export a separate CSV/JSON list of IDs and ownership for the 14 Todo parents before any cascade. Do not export private Notes content to shared places.
7. Run `supabase/v4_00_preflight_readonly.sql` against the intended project and compare live counts. If Focus entries, social attachments, RLS/function definitions or dependency graph differ, **stop and re-review**.
8. Deploy compat code and finalized migration in a coordinated maintenance window; test write paths, then enable new task creation UI. Keep rollback script and dump accessible privately.
9. Do not rely on transaction rollback after COMMIT. A tested external backup/restore path is mandatory.

## Migration preparation sequence

- Audit V3 code: AddTodoForm, TodoList, TaskBoardV2, TodayTodoWorkspace, CalendarPlanner/Views, recurring-execution.ts and Tauri Focus workspace.
- Finalize exact canonical DDL + contract of `save_task_v4` and `get_agenda`.
- Prefer a single approved Todo-only test reset after code compatibility, **not** dropping the whole database.
- Keep an explicit replacement edge for series slots until date-level precedence has an equivalent guarantee.
- Review existing `habit_patterns_v3` policies for `task_type='habit'`, and Journey policies bound to journey start/target.
- Only remove old schema in a cleanup migration after Web/Tauri and database function/reference checks pass.
- Sign-off requires: snapshot available, exact reset row IDs/scope, confirmed Focus zero or separately preserved, successful local build, cross-user RLS test, Mini Focus/Notes/Calendar regressions.

## Files

- `supabase/v4_00_preflight_readonly.sql`: safe read-only inventory, may be run now.
- `supabase/v4_01_migration_REVIEW_ONLY.sql`: intentionally refuses to run and describes changes; NOT executable migration. Must be replaced by an implementation-complete, reviewed migration.
- `docs/our-space-v4-schema-consolidation.md`: proposed canonical schema ownership.

**No database deletion, table alteration, or backup execution has occurred by committing these files.**
