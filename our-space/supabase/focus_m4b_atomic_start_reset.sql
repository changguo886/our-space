-- Our Space V2 M4-B: atomic Focus start and non-destructive reset.
-- Apply to STAGING first. No table changes, backfills or historical Focus edits.
-- Deployment order: SQL first, then feature branch UI.
BEGIN;

CREATE OR REPLACE FUNCTION public.start_focus_session_v2(p_todo_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_todo public.todos%ROWTYPE;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_todo FROM public.todos WHERE id = p_todo_id FOR UPDATE;
  IF NOT FOUND OR v_todo.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Todo not found or not owned' USING ERRCODE = '42501';
  END IF;
  IF v_todo.status = 'completed' THEN
    RAISE EXCEPTION 'Completed Todo cannot start focus';
  END IF;
  IF v_todo.status = 'running' OR v_todo.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Focus already running; refresh before retrying';
  END IF;
  UPDATE public.todos
     SET status = 'running', started_at = v_started
   WHERE id = p_todo_id;
  RETURN v_started;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_focus_timer_v2(p_todo_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_todo public.todos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_todo FROM public.todos WHERE id = p_todo_id FOR UPDATE;
  IF NOT FOUND OR v_todo.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Todo not found or not owned' USING ERRCODE = '42501';
  END IF;
  IF v_todo.status = 'running' OR v_todo.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'End current focus before reset';
  END IF;
  IF v_todo.status = 'completed' THEN
    RAISE EXCEPTION 'Completed Todo cannot be reset';
  END IF;
  UPDATE public.todos
     SET status = 'pending'
   WHERE id = p_todo_id;
  -- Preserve elapsed_seconds, completed_at, completion_level, and all focus_entries.
  RETURN v_todo.elapsed_seconds;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_focus_session_v2(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_focus_timer_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_focus_session_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_focus_timer_v2(uuid) TO authenticated;
COMMIT;
