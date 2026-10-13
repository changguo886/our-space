-- Tests for v4_13 (schedule integrity). Run by supabase/tests/run.sh.
\set ON_ERROR_STOP on
RESET ROLE;
INSERT INTO public.todos(id, user_id, title, task_date, task_type) VALUES
 ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Paper', current_date, 'one_time'),
 ('33333333-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Reading', current_date, 'one_time');
INSERT INTO public.todo_subtasks(id, todo_id, title) VALUES ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Intro');
INSERT INTO public.quick_notes(id, todo_id, subtask_id, content) VALUES ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'idea');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $t$
DECLARE s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
BEGIN
  DELETE FROM public.todo_subtasks WHERE id = '44444444-0000-0000-0000-000000000001';
  ASSERT (SELECT subtask_id FROM public.quick_notes WHERE id = '55555555-0000-0000-0000-000000000001') IS NULL, 'note kept, moved to Unsorted';

  INSERT INTO public.todo_sessions(id, todo_id, mode, scheduled_start, scheduled_end) VALUES
    (s1, '33333333-0000-0000-0000-000000000001', 'fixed', current_date + time '09:00', current_date + time '10:00'),
    (s2, '33333333-0000-0000-0000-000000000001', 'fixed', current_date + time '10:00', current_date + time '11:00');  -- touching: allowed
  -- other task, same time: allowed
  INSERT INTO public.todo_sessions(todo_id, mode, scheduled_start, scheduled_end) VALUES
    ('33333333-0000-0000-0000-000000000002', 'fixed', current_date + time '09:00', current_date + time '10:00');
  -- overlapping windows of the same task: allowed (intent, not exclusive time)
  INSERT INTO public.todo_sessions(todo_id, mode, plan_date, planned_minutes, window_start, window_end) VALUES
    ('33333333-0000-0000-0000-000000000001', 'window', current_date, 90, '09:00', '12:00'),
    ('33333333-0000-0000-0000-000000000001', 'window', current_date, 90, '09:00', '12:00');
  -- swap the two fixed sessions in one statement: allowed thanks to the deferred check
  UPDATE public.todo_sessions SET
    scheduled_start = CASE WHEN id = s1 THEN current_date + time '10:00' ELSE current_date + time '09:00' END,
    scheduled_end   = CASE WHEN id = s1 THEN current_date + time '11:00' ELSE current_date + time '10:00' END
  WHERE id IN (s1, s2);
  SET CONSTRAINTS ALL IMMEDIATE;
  -- a real overlap of the same task is refused
  BEGIN
    INSERT INTO public.todo_sessions(todo_id, mode, scheduled_start, scheduled_end) VALUES
      ('33333333-0000-0000-0000-000000000001', 'fixed', current_date + time '09:30', current_date + time '09:45');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'overlap must be refused';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS integrity: notes kept on step delete, fixed overlap refused, touching/other task/windows/swap allowed';
END
$t$;
RESET ROLE;
