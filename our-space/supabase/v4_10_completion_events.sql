-- =====================================================================================
-- Our Space V4.10 — Routine completion events (Phase 1)
-- Status: REVIEW BEFORE RUNNING. Not executed by any tool. Run manually in the SQL editor.
-- =====================================================================================
--
-- 影响范围 / Scope
--   * public.habit_logs: + completed_at (NOT NULL, default now()), + duration_minutes (nullable),
--     + client_event_id (UNIQUE, idempotency key), + focus_entry_id (FK focus_entries, ON DELETE SET NULL,
--     unique when present). Existing columns occurred_on / value / unit / note are kept unchanged.
--   * public.todos: + CHECK todos_routine_never_completed (NOT VALID: enforced for new writes only;
--     existing rows are corrected and validated by v4_data_fix_routine_status.sql).
--   * New RPCs: log_completion_v4, undo_completion_v4, finish_focus_session_v4.
--   * Replaced RPC: finish_focus_session (same signature). For routines, action 'complete' now behaves
--     like 'end' (no whole-task completion). One-time / project behaviour is unchanged.
--   * No rows are deleted. Legacy habit_logs rows (if any) get completed_at = created_at.
--
-- 身份与幂等 / Identity and idempotency
--   * A completion event is identified by habit_logs.id.
--   * Every write from the app carries a client-generated client_event_id (one per user action,
--     reused on retry). A repeated call returns the existing id instead of inserting again.
--   * A completion created from Focus is linked by focus_entry_id; one focus entry can back at most one
--     completion, so time is never counted twice.
--   * Undo deletes by id only; deleting an already-deleted id returns false, never an error.
--
-- 前置条件 / Prerequisites
--   v4_02, v4_04 (task_type cutover), v4_06 applied; habit_logs and focus_entries exist with RLS.
--
-- 只读预检 / Read-only preflight (run first; all must match expectations)
--   -- P1 tables and RLS exist (expect 2 rows, relrowsecurity = true):
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('habit_logs','focus_entries') AND relnamespace='public'::regnamespace;
--   -- P2 habit_logs owner policies exist (expect select/insert/update/delete):
--   SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='habit_logs';
--   -- P3 columns not yet present (expect 0 rows; if present, review before re-running):
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='habit_logs'
--     AND column_name IN ('completed_at','duration_minutes','client_event_id','focus_entry_id');
--   -- P4 routines currently marked completed (any count is fine; they are fixed by the data-fix script):
--   SELECT count(*) FROM public.todos WHERE task_type IN ('routine','habit') AND status='completed';
--   -- P5 focus_entries.client_event_id is unique (expect 1 row):
--   SELECT conname FROM pg_constraint WHERE conrelid='public.focus_entries'::regclass AND contype='u';
--   -- P6 current definition of finish_focus_session, saved for rollback:
--   SELECT pg_get_functiondef('public.finish_focus_session(uuid,text,timestamptz)'::regprocedure);
--
-- 备份要求 / Backup
--   Before running: a Supabase backup (Dashboard → Database → Backups) newer than 24h, or
--   pg_dump of public.habit_logs, public.todos, public.focus_entries; and the P6 output saved to a file.
--
-- 执行顺序 / Order
--   v4_10 (this file) → deploy app code from Phase 1 → v4_data_fix_routine_status.sql (validates the CHECK).
--   The Phase 1 app code calls log_completion_v4 / finish_focus_session_v4 and shows a clear message if
--   this migration has not been run yet.
--
-- 回滚 / Rollback (bottom of this file). Rolling back drops the new RPCs and constraint and restores the
--   saved finish_focus_session definition. The added columns are kept (dropping them would discard events).
-- =====================================================================================

BEGIN;

-- 1. Completion event columns ---------------------------------------------------------
ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS client_event_id uuid,
  ADD COLUMN IF NOT EXISTS focus_entry_id uuid;

UPDATE public.habit_logs SET completed_at = created_at WHERE completed_at IS NULL;
ALTER TABLE public.habit_logs ALTER COLUMN completed_at SET DEFAULT now();
ALTER TABLE public.habit_logs ALTER COLUMN completed_at SET NOT NULL;

ALTER TABLE public.habit_logs DROP CONSTRAINT IF EXISTS habit_logs_duration_valid;
ALTER TABLE public.habit_logs ADD CONSTRAINT habit_logs_duration_valid
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440);

ALTER TABLE public.habit_logs DROP CONSTRAINT IF EXISTS habit_logs_client_event_key;
ALTER TABLE public.habit_logs ADD CONSTRAINT habit_logs_client_event_key UNIQUE (client_event_id);

ALTER TABLE public.habit_logs DROP CONSTRAINT IF EXISTS habit_logs_focus_entry_fkey;
ALTER TABLE public.habit_logs ADD CONSTRAINT habit_logs_focus_entry_fkey
  FOREIGN KEY (focus_entry_id) REFERENCES public.focus_entries(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_focus_entry_uidx
  ON public.habit_logs(focus_entry_id) WHERE focus_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS habit_logs_todo_occurred_idx ON public.habit_logs(todo_id, occurred_on);

-- 2. A routine is never completed as a whole ------------------------------------------
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_routine_never_completed;
ALTER TABLE public.todos ADD CONSTRAINT todos_routine_never_completed
  CHECK (NOT (task_type IN ('routine','habit') AND status = 'completed')) NOT VALID;

-- 3. Record one completion ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_completion_v4(
  p_todo_id uuid,
  p_client_event_id uuid,
  p_occurred_on date,
  p_completed_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  v_type text;
  v_id uuid;
  v_owner_todo uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE = '42501'; END IF;
  IF p_client_event_id IS NULL THEN RAISE EXCEPTION 'client_event_id is required'; END IF;
  SELECT task_type INTO v_type FROM public.todos WHERE id = p_todo_id AND user_id = auth.uid();
  IF v_type IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501'; END IF;
  IF v_type NOT IN ('routine','habit') THEN RAISE EXCEPTION 'Only routines record completion events'; END IF;
  IF p_occurred_on IS NULL OR p_occurred_on > current_date + 1 THEN RAISE EXCEPTION 'Invalid occurrence date'; END IF;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'Invalid duration'; END IF;

  INSERT INTO public.habit_logs(todo_id, occurred_on, completed_at, duration_minutes, client_event_id, note)
  VALUES (p_todo_id, p_occurred_on, coalesce(p_completed_at, now()), p_duration_minutes, p_client_event_id, nullif(btrim(p_note), ''))
  ON CONFLICT (client_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN  -- retry of an event that already landed
    SELECT id, todo_id INTO v_id, v_owner_todo FROM public.habit_logs WHERE client_event_id = p_client_event_id;
    IF v_owner_todo IS DISTINCT FROM p_todo_id THEN RAISE EXCEPTION 'client_event_id belongs to another task'; END IF;
  END IF;
  RETURN v_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.log_completion_v4(uuid,uuid,date,timestamptz,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_completion_v4(uuid,uuid,date,timestamptz,integer,text) TO authenticated;

-- 4. Undo one completion --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_completion_v4(p_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.habit_logs h
   USING public.todos t
   WHERE h.id = p_log_id AND t.id = h.todo_id AND t.user_id = auth.uid();
  RETURN FOUND;  -- false when already undone: idempotent
END
$fn$;
REVOKE ALL ON FUNCTION public.undo_completion_v4(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_completion_v4(uuid) TO authenticated;

-- 5. Focus finish that understands routines -------------------------------------------
-- Same focus bookkeeping as finish_focus_session v1.1. Difference: for a routine, 'complete'
-- records ONE completion event (linked to this focus entry, duration from real focus time)
-- and leaves the task active. p_client_event_id is the idempotency key of that completion.
CREATE OR REPLACE FUNCTION public.finish_focus_session_v4(
  p_todo_id uuid,
  p_action text,
  p_expected_started_at timestamptz DEFAULT NULL,
  p_client_event_id uuid DEFAULT NULL,
  p_occurred_on date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_todo public.todos%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_seconds integer := 0;
  v_elapsed integer;
  v_event_hash text;
  v_event_id uuid;
  v_focus_id uuid;
  v_routine boolean;
  v_completion uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('pause','end','complete') THEN RAISE EXCEPTION 'Invalid focus action'; END IF;

  SELECT * INTO v_todo FROM public.todos WHERE id = p_todo_id FOR UPDATE;
  IF NOT FOUND OR v_todo.user_id <> auth.uid() THEN RAISE EXCEPTION 'Todo not found or not owned' USING ERRCODE = '42501'; END IF;
  v_routine := v_todo.task_type IN ('routine','habit');
  IF v_todo.status = 'completed' AND NOT v_routine THEN RAISE EXCEPTION 'Todo already completed'; END IF;
  IF v_routine AND p_action = 'complete' AND p_client_event_id IS NULL THEN
    RAISE EXCEPTION 'client_event_id is required to complete a routine occurrence';
  END IF;

  IF v_todo.status = 'running' THEN
    IF v_todo.started_at IS NULL OR p_expected_started_at IS NULL OR v_todo.started_at <> p_expected_started_at THEN
      RAISE EXCEPTION 'Focus state has changed; refresh before retrying';
    END IF;
    v_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_todo.started_at)))::integer);
    IF v_seconds > 0 THEN
      v_event_hash := md5(v_todo.id::text || ':' || v_todo.started_at::text);
      v_event_id := (substr(v_event_hash,1,8)||'-'||substr(v_event_hash,9,4)||'-'||substr(v_event_hash,13,4)||'-'||substr(v_event_hash,17,4)||'-'||substr(v_event_hash,21,12))::uuid;
      INSERT INTO public.focus_entries(todo_id, client_event_id, started_at, ended_at, duration_seconds)
      VALUES (v_todo.id, v_event_id, v_todo.started_at, v_now, v_seconds)
      ON CONFLICT (client_event_id) DO NOTHING;
      SELECT id INTO v_focus_id FROM public.focus_entries WHERE client_event_id = v_event_id;
    END IF;
  ELSIF p_expected_started_at IS NOT NULL AND NOT (v_routine AND p_action = 'complete') THEN
    RAISE EXCEPTION 'Focus already stopped; refresh before retrying';
  END IF;

  v_elapsed := COALESCE(v_todo.elapsed_seconds, 0) + v_seconds;

  IF v_routine THEN
    UPDATE public.todos SET
      status = CASE WHEN p_action = 'pause' THEN 'paused' ELSE 'pending' END,
      started_at = NULL, elapsed_seconds = v_elapsed
    WHERE id = v_todo.id;
    IF p_action = 'complete' THEN
      INSERT INTO public.habit_logs(todo_id, occurred_on, completed_at, duration_minutes, client_event_id, focus_entry_id)
      VALUES (v_todo.id, coalesce(p_occurred_on, current_date), v_now,
              CASE WHEN v_seconds > 0 THEN LEAST(1440, GREATEST(1, ROUND(v_seconds / 60.0)::integer)) END,
              p_client_event_id, v_focus_id)
      ON CONFLICT (client_event_id) DO NOTHING
      RETURNING id INTO v_completion;
      IF v_completion IS NULL THEN
        SELECT id INTO v_completion FROM public.habit_logs WHERE client_event_id = p_client_event_id AND todo_id = v_todo.id;
      END IF;
    END IF;
  ELSE
    UPDATE public.todos SET
      status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'paused' END,
      started_at = NULL, elapsed_seconds = v_elapsed,
      completed_at = CASE WHEN p_action = 'complete' THEN v_now ELSE completed_at END
    WHERE id = v_todo.id;
  END IF;

  RETURN jsonb_build_object('elapsed', v_elapsed, 'completion_id', v_completion, 'focus_entry_id', v_focus_id);
END
$fn$;
REVOKE ALL ON FUNCTION public.finish_focus_session_v4(uuid,text,timestamptz,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_focus_session_v4(uuid,text,timestamptz,uuid,date) TO authenticated;

-- 6. Old entry point stays safe for clients that have not updated (e.g. an old desktop build):
--    for a routine, 'complete' is treated as 'end' (focus time saved, no whole-task completion,
--    no completion event without an idempotency key).
CREATE OR REPLACE FUNCTION public.finish_focus_session(
  p_todo_id uuid,
  p_action text,
  p_expected_started_at timestamptz DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_type text;
BEGIN
  SELECT task_type INTO v_type FROM public.todos WHERE id = p_todo_id;
  RETURN (public.finish_focus_session_v4(
    p_todo_id,
    CASE WHEN v_type IN ('routine','habit') AND p_action = 'complete' THEN 'end' ELSE p_action END,
    p_expected_started_at, NULL, NULL
  )->>'elapsed')::integer;
END
$fn$;
REVOKE ALL ON FUNCTION public.finish_focus_session(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_focus_session(uuid,text,timestamptz) TO authenticated;

COMMIT;

-- 验证 / Post-checks
--   SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('todos_routine_never_completed','habit_logs_client_event_key');
--   -- expect todos_routine_never_completed convalidated = false until the data-fix script runs.

-- =====================================================================================
-- 回滚 / ROLLBACK (run only if needed; restores behaviour, keeps recorded events)
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.log_completion_v4(uuid,uuid,date,timestamptz,integer,text);
--   DROP FUNCTION IF EXISTS public.undo_completion_v4(uuid);
--   -- Restore finish_focus_session from the P6 output saved before running (paste it here), THEN:
--   DROP FUNCTION IF EXISTS public.finish_focus_session_v4(uuid,text,timestamptz,uuid,date);
--   ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_routine_never_completed;
--   -- Columns, constraints and indexes on habit_logs are intentionally kept.
-- COMMIT;
-- =====================================================================================
