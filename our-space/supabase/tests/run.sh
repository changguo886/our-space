#!/usr/bin/env bash
# Runs every V4 migration, its tests and its rollback against a THROWAWAY local PostgreSQL.
# Usage: PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
# Never point this at Supabase: it creates and drops the database "our_space_migration_test".
set -euo pipefail
cd "$(dirname "$0")/.."
DB=our_space_migration_test
psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
export PGOPTIONS="-c client_min_messages=notice"
quiet() { PGOPTIONS="-c client_min_messages=warning" psql_db "$@"; }

psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql_db -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN NULL; END IF; END \$\$" >/dev/null
# Roles are cluster-wide; create them only once.
psql -X -q -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='authenticated'" | grep -q 1 \
  && sed -e '/^CREATE ROLE/d' tests/00_mock_supabase.sql > /tmp/os_mock.sql \
  || cp tests/00_mock_supabase.sql /tmp/os_mock.sql
quiet -f /tmp/os_mock.sql

# Existing migrations this work builds on (already applied in production).
quiet -f task_model_v3_m7_template_revision.sql
quiet -f finish_focus_session_v1_1.sql
awk '/^CREATE OR REPLACE FUNCTION public.save_task_v4/,/^\$fn\$;/' v4_04_task_type_cutover.sql > /tmp/os_save_task_prev.sql
quiet -f /tmp/os_save_task_prev.sql
psql_db -At -c "SELECT pg_get_functiondef('public.finish_focus_session(uuid,text,timestamptz)'::regprocedure)" > /tmp/os_finish_v1.sql

step() { echo; echo "== $*"; }

step "v4_10 completion events"
quiet -f v4_10_completion_events.sql
quiet -f v4_10_completion_events.sql   # re-runnable
psql_db -f tests/10_completion_events_test.sql 2>&1 | grep -E "PASS|ERROR|FATAL"

step "data fix: routines completed as a whole"
psql_db -c "ALTER TABLE public.todos DROP CONSTRAINT todos_routine_never_completed"
psql_db -c "INSERT INTO public.todos(id,user_id,title,task_date,task_type,status,completed_at) VALUES ('11111111-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','Old run',current_date,'routine','completed',now())"
psql_db -c "ALTER TABLE public.todos ADD CONSTRAINT todos_routine_never_completed CHECK (NOT (task_type IN ('routine','habit') AND status = 'completed')) NOT VALID"
quiet -f v4_data_fix_routine_status.sql
test "$(psql_db -At -c "SELECT status FROM public.todos WHERE id='11111111-0000-0000-0000-000000000003'")" = pending
test "$(psql_db -At -c "SELECT convalidated FROM pg_constraint WHERE conname='todos_routine_never_completed'")" = t
echo "PASS data fix: routine restored to pending, constraint validated"
# data-fix rollback restores the original values from the snapshot, then re-apply
sed -n '/^-- 回滚 \/ ROLLBACK/,$p' v4_data_fix_routine_status.sql | grep '^--   \|^-- BEGIN\|^-- COMMIT' | sed 's/^-- \{0,3\}//' > /tmp/os_fix_rb.sql
quiet -f /tmp/os_fix_rb.sql
test "$(psql_db -At -c "SELECT status FROM public.todos WHERE id='11111111-0000-0000-0000-000000000003'")" = completed
echo "PASS data-fix rollback restores the snapshot"
quiet -c "UPDATE public.todos SET status='pending', completed_at=NULL WHERE id='11111111-0000-0000-0000-000000000003'"
quiet -c "ALTER TABLE public.todos ADD CONSTRAINT todos_routine_never_completed CHECK (NOT (task_type IN ('routine','habit') AND status = 'completed'))"

if [ -f tests/11_series_identity_test.sql ]; then
  step "v4_11 series identity"
  quiet -f v4_11_series_identity.sql
  quiet -f v4_11_series_identity.sql
  psql_db -f tests/11_series_identity_test.sql 2>&1 | grep -E "PASS|ERROR|FATAL"
fi
if [ -f tests/12_date_only_test.sql ]; then
  step "v4_12 date-only tasks"
  quiet -f v4_12_date_only_tasks.sql
  quiet -f v4_12_date_only_tasks.sql
  psql_db -f tests/12_date_only_test.sql 2>&1 | grep -E "PASS|ERROR|FATAL"
fi
if [ -f tests/13_schedule_integrity_test.sql ]; then
  step "v4_13 schedule integrity"
  psql_db -At -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='quick_notes_subtask_id_fkey'"
  quiet -f v4_13_schedule_integrity.sql
  quiet -f v4_13_schedule_integrity.sql
  psql_db -f tests/13_schedule_integrity_test.sql 2>&1 | grep -E "PASS|ERROR|FATAL"
fi

step "rollbacks (newest first)"
for f in v4_13_schedule_integrity.sql v4_12_date_only_tasks.sql v4_11_series_identity.sql; do
  [ -f "$f" ] || continue
  sed -n '/^-- ROLLBACK-BEGIN/,/^-- ROLLBACK-END/p' "$f" | sed -e 's/^-- \{0,1\}//' -e '/^ROLLBACK-/d' -e 's#^\\i save_task_v4_previous.sql#\\i /tmp/os_save_task_prev.sql#' > /tmp/os_rb.sql
  psql_db -f /tmp/os_rb.sql && echo "PASS rollback $f"
  if [ "$f" = v4_13_schedule_integrity.sql ]; then
    test "$(psql_db -At -c "SELECT confdeltype FROM pg_constraint WHERE conname='quick_notes_subtask_id_fkey'")" = a
    echo "PASS rollback restored the original notes FK (no action)"
  fi
done
# v4_10 rollback: restore the saved v1 function, then drop the new objects.
psql_db -f /tmp/os_finish_v1.sql
psql_db -c "DROP FUNCTION public.log_completion_v4(uuid,uuid,date,timestamptz,integer,text); DROP FUNCTION public.undo_completion_v4(uuid); DROP FUNCTION public.finish_focus_session_v4(uuid,text,timestamptz,uuid,date); ALTER TABLE public.todos DROP CONSTRAINT todos_routine_never_completed;"
echo "PASS rollback v4_10_completion_events.sql"

psql -X -q -d postgres -c "DROP DATABASE $DB"
echo; echo "ALL MIGRATION TESTS FINISHED"
