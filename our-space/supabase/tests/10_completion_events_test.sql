-- Tests for v4_10 (completion events) and the routine data fix. Run by supabase/tests/run.sh.
\set ON_ERROR_STOP on
RESET ROLE;
INSERT INTO auth.users VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.profiles(id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.todos(id, user_id, title, task_date, task_type, status) VALUES
 ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Drink water', current_date, 'routine', 'pending'),
 ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buy phone', current_date, 'one_time', 'pending'),
 ('11111111-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', 'B run', current_date, 'routine', 'pending');
INSERT INTO public.habit_patterns_v3(todo_id, period, arrangement, target_count) VALUES
 ('11111111-0000-0000-0000-000000000001', 'day', 'flexible', 8);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

DO $t$
DECLARE a uuid; b uuid; c uuid; ok boolean;
BEGIN
  -- one tap = one event; the same key again returns the same event (idempotent retry)
  a := public.log_completion_v4('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', current_date);
  b := public.log_completion_v4('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', current_date);
  ASSERT a = b, 'retry with the same client_event_id must return the same event';
  -- a second tap the same day is a second event (drink water 8 times)
  c := public.log_completion_v4('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', current_date);
  ASSERT c <> a, 'second tap must create a second event';
  ASSERT (SELECT count(*) FROM public.habit_logs WHERE todo_id = '11111111-0000-0000-0000-000000000001') = 2, 'two events expected';
  ASSERT (SELECT duration_minutes FROM public.habit_logs WHERE id = a) IS NULL, 'no invented duration';
  ASSERT (SELECT status FROM public.todos WHERE id = '11111111-0000-0000-0000-000000000001') = 'pending', 'routine stays active';

  -- only routines take completion events
  BEGIN
    PERFORM public.log_completion_v4('11111111-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', current_date);
    RAISE EXCEPTION 'one_time must be rejected';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE 'Only routines%', 'unexpected error: ' || SQLERRM;
  END;
  -- a key cannot be reused for another task
  BEGIN
    PERFORM public.log_completion_v4('11111111-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', current_date);
    RAISE EXCEPTION 'reused key must be rejected';
  EXCEPTION WHEN others THEN NULL;
  END;
  -- future dates are rejected
  BEGIN
    PERFORM public.log_completion_v4('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', current_date + 5);
    RAISE EXCEPTION 'future date must be rejected';
  EXCEPTION WHEN others THEN ASSERT SQLERRM LIKE 'Invalid occurrence%', SQLERRM;
  END;

  -- undo is by id and idempotent
  ok := public.undo_completion_v4(c);
  ASSERT ok, 'first undo deletes';
  ok := public.undo_completion_v4(c);
  ASSERT NOT ok, 'second undo is a no-op';

  -- the database refuses to complete a routine as a whole
  BEGIN
    UPDATE public.todos SET status = 'completed' WHERE id = '11111111-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'routine completion must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS completion events: idempotency, multiple per day, undo, guard';
END
$t$;

-- Another user cannot see, write or undo A's events.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $t$
DECLARE ok boolean;
BEGIN
  ASSERT (SELECT count(*) FROM public.habit_logs) = 0, 'RLS: B sees no events of A';
  BEGIN
    PERFORM public.log_completion_v4('11111111-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000009', current_date);
    RAISE EXCEPTION 'B must not log on A''s task';
  EXCEPTION WHEN others THEN ASSERT SQLERRM LIKE 'Task not found%', SQLERRM;
  END;
  ok := public.undo_completion_v4((SELECT id FROM public.habit_logs LIMIT 1));
  ASSERT NOT coalesce(ok, false), 'B cannot undo A''s event';
  RAISE NOTICE 'PASS completion events: owner isolation';
END
$t$;

-- Focus "complete" on a routine records one event linked to the real focus entry.
RESET ROLE;
UPDATE public.todos SET status = 'running', started_at = now() - interval '10 minutes' WHERE id = '11111111-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $t$
DECLARE r jsonb; r2 jsonb; s timestamptz; n integer;
BEGIN
  SELECT started_at INTO s FROM public.todos WHERE id = '11111111-0000-0000-0000-000000000001';
  r := public.finish_focus_session_v4('11111111-0000-0000-0000-000000000001', 'complete', s, 'f0000000-0000-0000-0000-000000000001', current_date);
  ASSERT (r->>'completion_id') IS NOT NULL, 'focus complete must record a completion';
  ASSERT (SELECT status FROM public.todos WHERE id = '11111111-0000-0000-0000-000000000001') = 'pending', 'routine stays active after focus';
  ASSERT (SELECT focus_entry_id FROM public.habit_logs WHERE id = (r->>'completion_id')::uuid) = (r->>'focus_entry_id')::uuid, 'linked to focus entry';
  ASSERT (SELECT duration_minutes FROM public.habit_logs WHERE id = (r->>'completion_id')::uuid) BETWEEN 9 AND 11, 'duration from real focus time';
  SELECT count(*) INTO n FROM public.habit_logs;
  -- retry of the same request (e.g. network error) does not double count
  r2 := public.finish_focus_session_v4('11111111-0000-0000-0000-000000000001', 'complete', s, 'f0000000-0000-0000-0000-000000000001', current_date);
  ASSERT r2->>'completion_id' = r->>'completion_id', 'retry returns the same completion';
  ASSERT (SELECT count(*) FROM public.habit_logs) = n, 'retry inserts nothing';
  ASSERT (SELECT count(*) FROM public.focus_entries) = 1, 'one focus entry';
  -- the old entry point never completes a routine
  PERFORM public.finish_focus_session('11111111-0000-0000-0000-000000000001', 'complete', NULL);
  ASSERT (SELECT status FROM public.todos WHERE id = '11111111-0000-0000-0000-000000000001') <> 'completed', 'old RPC must not complete a routine';
  ASSERT (SELECT count(*) FROM public.habit_logs) = n, 'old RPC records no event without a key';
  -- one-time tasks keep the original behaviour
  r := public.finish_focus_session_v4('11111111-0000-0000-0000-000000000002', 'complete', NULL, NULL, NULL);
  ASSERT (SELECT status FROM public.todos WHERE id = '11111111-0000-0000-0000-000000000002') = 'completed', 'one-time completes';
  RAISE NOTICE 'PASS focus: routine occurrence, idempotent retry, legacy RPC safe, one-time unchanged';
END
$t$;
RESET ROLE;
