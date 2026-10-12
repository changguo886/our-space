-- V1.1 focus persistence; apply only AFTER focus_entries table exists.
-- Executes the end-of-focus Todo update and optional history insert atomically.
BEGIN;
CREATE OR REPLACE FUNCTION public.finish_focus_session(
  p_todo_id uuid,
  p_action text,
  p_expected_started_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_todo public.todos%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_seconds integer := 0;
  v_elapsed integer;
  v_event_hash text;
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('pause', 'end', 'complete') THEN
    RAISE EXCEPTION 'Invalid focus action';
  END IF;

  SELECT * INTO v_todo FROM public.todos WHERE id = p_todo_id FOR UPDATE;
  IF NOT FOUND OR v_todo.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Todo not found or not owned' USING ERRCODE = '42501';
  END IF;
  IF v_todo.status = 'completed' THEN
    RAISE EXCEPTION 'Todo already completed';
  END IF;

  IF v_todo.status = 'running' THEN
    IF v_todo.started_at IS NULL
       OR p_expected_started_at IS NULL
       OR v_todo.started_at <> p_expected_started_at THEN
      RAISE EXCEPTION 'Focus state has changed; refresh before retrying';
    END IF;
    v_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_todo.started_at)))::integer);
    IF v_seconds > 0 THEN
      -- Deterministic event ID makes retries idempotent for this running interval.
      v_event_hash := md5(v_todo.id::text || ':' || v_todo.started_at::text);
      v_event_id := (
        substr(v_event_hash, 1, 8) || '-' ||
        substr(v_event_hash, 9, 4) || '-' ||
        substr(v_event_hash, 13, 4) || '-' ||
        substr(v_event_hash, 17, 4) || '-' ||
        substr(v_event_hash, 21, 12)
      )::uuid;
      INSERT INTO public.focus_entries (
        todo_id, client_event_id, started_at, ended_at, duration_seconds
      ) VALUES (
        v_todo.id, v_event_id, v_todo.started_at, v_now, v_seconds
      ) ON CONFLICT (client_event_id) DO NOTHING;
    END IF;
  ELSIF p_expected_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Focus already stopped; refresh before retrying';
  END IF;

  v_elapsed := COALESCE(v_todo.elapsed_seconds, 0) + v_seconds;
  UPDATE public.todos SET
    status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'paused' END,
    started_at = NULL,
    elapsed_seconds = v_elapsed,
    completed_at = CASE WHEN p_action = 'complete' THEN v_now ELSE completed_at END
  WHERE id = v_todo.id;

  RETURN v_elapsed;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_focus_session(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_focus_session(uuid, text, timestamptz) TO authenticated;
COMMIT;
