# Our Space — Database Environments & Migration Workflow

Status: **Accepted — streamlined workflow** (2026-10-12)
Repository: `changguo886/our-space`

## Environment roles

- **Production** is the canonical live user database. Production web must point to it. A local V2 feature branch **may also connect to Production** for quick, deliberate UI and low-risk functional tests, but every write is a real write.
- **Staging** is a separate copied test environment, **not** a continuously synchronized backup. Keep it available for medium/high-risk schema or data operations and authenticated RLS tests. The 2026-10-12 baseline showed matching ID fingerprints for 15 todos, 10 todo_sessions, 2 quick_notes and 2 goal_journeys, not guaranteed matching current contents.
- Never infer target environment from branch name. Check `NEXT_PUBLIC_SUPABASE_URL` project ref (in local `.env.local` and each Vercel environment) **before running SQL or write tests**. Never commit keys or connection credentials.

## Default low-friction workflow

1. Implement on a GitHub feature branch; keep SQL migration and change notes versioned. Compile/build locally before merge.
2. Classify database changes by risk. **Low risk**: additive table/column/index on small existing data sets, backward-compatible, with no destructive backfill and no high-impact policy modification. These **may go directly to Production** after review, recent verified backup/recovery option, compatibility check, and explicit user approval. Staging is optional in this case.
3. Apply approved migration in Production SQL Editor after verifying the selected project. GitHub commits do not execute SQL. Preserve existing records; do not paste old Staging data over live data.
4. Verify database structure, old row counts and behavior. Local V2 branch may then test **clearly labeled disposable test records** against Production. Never alter/delete genuine tasks to test; clean up only known test records, checking dependent data.
5. Build, smoke-test Today/Todo/Calendar/Quick Notes/Journey/Focus and repeat/habit behavior, then review and merge. Record SQL file, commit, execution environment, verification and any forward-fix in the development log.

## Risk escalation — assistant must warn before execution

- **Medium risk — recommend Staging first:** modifying RLS policies/functions or triggers, backfills that update existing rows, adding restrictive constraints to populated tables, recurrence generation, cascading changes, modifying production data beyond disposable test records, potentially blocking schema changes, or changes across several dependent tables.
- **High risk — require Staging testing and verified restorable backup before Production:** drop/truncate, destructive/type-conversion migrations, bulk rewrites, auth or ownership changes, uncertain rollback, or any migration risking permanent data loss.
- If medium/high risk is detected, explicitly identify affected tables, risk and safe alternative **before suggesting running it on Production**. Do not silently lower risk just because tests are inconvenient.
- PostgreSQL transactions can roll back uncommitted work; a migration already COMMITted cannot be undone with a later ROLLBACK. Prefer reversible, additive migrations; document compensating SQL and recognize that dropping new tables/columns may lose data written since deployment.
- Preserve independent `todos`, `todo_subtasks`, `todo_sessions`, `quick_notes`, `goal_journeys`, `goal_journey_days`. Do not prematurely drop `todos.scheduled_start/end`; distinguish calendar plans, completed occurrences, habit logs and actual Focus history.
- For new RLS behavior, test as authenticated users; running SELECT as privileged SQL Editor user does not prove policies restrict access correctly.

## Task Model V2 status and promotion gate (2026-10-12)

- Branch `feature/task-model-v2`.
- `supabase/task_model_v2_phase1.sql`: additive task type, backfill of existing recurrence-bearing todos, task_occurrences/habit_logs and RLS. **Classify as medium risk because of the backfill and RLS** even though table creation itself is additive.
- `supabase/task_model_v2_phase2_create.sql`: new atomic recurring/habit RPC. Privileges/function require targeted testing.
- Staging execution reported successful, and user reported `mislabeled_recurring_todos = 0`. This is **not** proof that Production is migrated.
- Before production test, check whether `todos.task_type`, `task_occurrences`, `habit_logs` and `create_scheduled_todo_v2` exist in Production; do not run V2 app against unmigrated Production. Review and back up before promoting approved SQL.
- V1.1 Staging-only scripts such as `ourspace_v1_1_staging_rls_test.mjs` may be archived outside the active branch; they are not required for running the V2 application. Do not commit scripts containing secrets.
- Full functional create/edit/delete, RLS and build test gates are **not yet independently verified**.

## New-chat handoff

Read this file and `docs/calendar-architecture-phase-a.md`. Confirm branch, current schema, target Project URL ref, migration execution status, and any uncommitted local changes. Use the simple Production-first route for reviewed low-risk changes; alert the user and route medium/high-risk work through Staging as appropriate. Never overwrite live user data with a copied Staging database.
