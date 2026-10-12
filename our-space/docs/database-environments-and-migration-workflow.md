# Our Space — Database Environments & Migration Workflow

Status: **Accepted development policy** (2026-10-12)
Repository: `changguo886/our-space`

## Environment responsibilities

- **Production Supabase**: source of truth for live user data. The deployed production web app should target Production, verified via the Vercel **Production** values of `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (compare project refs; never publish secrets).
- **Staging Supabase**: separate, copied test database. It initially contained the same identifiers/counts as Production for 15 `todos`, 10 `todo_sessions`, 2 `quick_notes`, and 2 `goal_journeys` on 2026-10-12. It is **not a live mirror**. It may diverge after tests.
- **Preview / Development apps**: should point to Staging when testing schema-dependent feature branches. Check environment-specific Vercel configuration before testing. Never assume merely creating Staging switched any deployed app.

## Mandatory schema change workflow

1. **Write versioned SQL in GitHub on a feature branch**, review dependencies, table names, constraints, foreign keys, RLS, and old UI compatibility. Never change `main` just to test an unverified migration.
2. **Back up/check Staging**, then apply the **full migration SQL** via Staging SQL Editor or an explicitly configured migration runner. Saving a SQL file to GitHub does **not** execute it in Supabase.
3. **Run read-only verification on Staging**: inspect columns/tables, foreign keys and RLS policies, compare row counts/identities of existing tables, and test representative create/edit/delete operations using the Staging app.
4. **Regression test** Todo, Quick Notes, scheduled Sessions, Calendar/drag-and-drop, Journey, Focus history, repeat rules and time zones, as applicable. Verify that existing records and completed history remain intact.
5. **Only after Staging passes**, make a fresh Production backup/snapshot, review the exact SQL and migration state in Production, and execute the **same approved migration against Production**. Do not copy the Staging database onto Production or overwrite newer live records.
6. **Verify Production** after migration: required columns/tables, RLS, row counts, existing data and app behavior. Deploy production code in a compatibility-safe sequence (additive migration before feature-dependent UI).
7. **Record** migration name/commit, target Supabase project, date, executed-by, verification results, and any rollback/forward-fix plan in the development log. An SQL Editor execution may not populate `supabase_migrations.schema_migrations`; absence of that table alone does not imply migration failure.

## Safeguards

- Always confirm the selected Supabase project **before pressing Run**. Never run exploratory DDL on Production.
- Staging and Production have separate databases; matching counts or row-ID fingerprints show copied identities but **do not** prove payload equality or ongoing synchronization.
- Avoid destructive migrations on existing `todos`, `todo_subtasks`, `todo_sessions`, `quick_notes`, `goal_journeys`, and `goal_journey_days`.
- Keep `todos.scheduled_start/end` and `todo_sessions` for compatibility until a separately approved migration.
- Planned Sessions, executed Focus history, recurring occurrences, and habit logs have distinct meanings and must not silently rewrite each other.
- Never commit database credentials, service-role tokens, or production user data to GitHub. Use environment-variable names only.
- Test all new RLS policies (including insert/update/delete) as authenticated users and for denied cross-user access.
- If Staging tests fail, stop; fix the migration on the branch and retest. Never promote an unverified SQL file.

## Task Model V2 — 2026-10-12

- Development branch: `feature/task-model-v2`
- Initial SQL file: `our-space/supabase/task_model_v2_phase1.sql`
- Adds `todos.task_type`; backfills existing todos with recurrence rules as `recurring`; introduces `task_occurrences` and `habit_logs` with RLS.
- On initial attempt, the query `SELECT task_type...` failed with `column "task_type" does not exist`. That was **verification SQL run before the migration**; it does not indicate corrupted data.
- User later reported **"ok了"** after instructions to apply the full migration on Staging. **Execution and detailed verification results have not been independently inspected here**. Confirm Staging schema and RLS before promotion; do not infer Production has been migrated.

## Handoff checklist for new chats

Read this document and `docs/calendar-architecture-phase-a.md` first. Inspect current branch and migration files. Confirm which Supabase environment an action targets; do not assume new chats have access to live credentials. Keep Production data as the source of truth, test schema changes on Staging, and only then apply approved, reviewed migrations to Production.
