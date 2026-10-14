-- Tests for v4_11 (series identity). Run by supabase/tests/run.sh after the v4_10 tests.
\set ON_ERROR_STOP on
RESET ROLE;
INSERT INTO public.todos(id, user_id, title, task_date, task_type) VALUES
 ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'English', current_date, 'routine');
-- Batch X = Mon/Wed/Fri saved together; batch Y = an independent Monday slot with identical time.
INSERT INTO public.todo_execution_templates(todo_id, slot_key, batch_id, starts_on, execution_mode, selector_kind, selector_value, start_time, end_time) VALUES
 ('22222222-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', current_date - 14, 'fixed', 'weekday', 1, '19:00', '20:00'),
 ('22222222-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-00000000000a', current_date - 14, 'fixed', 'weekday', 3, '19:00', '20:00'),
 ('22222222-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-00000000000a', current_date - 14, 'fixed', 'weekday', 5, '20:00', '21:00'),
 ('22222222-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-00000000000b', current_date - 14, 'fixed', 'weekday', 1, '19:00', '20:00');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

DO $t$
DECLARE n integer; c integer;
BEGIN
  -- Change only Friday from next week.
  n := public.revise_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', ARRAY['a1000000-0000-0000-0000-000000000005']::uuid[], current_date + 7, 'fixed', '07:00', '08:00');
  ASSERT n = 1, 'one slot changed';
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE slot_key = 'a1000000-0000-0000-0000-000000000005') = 2, 'Friday has two versions';
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE slot_key = 'a1000000-0000-0000-0000-000000000001') = 1, 'Monday untouched';
  ASSERT (SELECT start_time FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000b') = '19:00', 'independent series untouched';
  ASSERT (SELECT count(DISTINCT batch_id) FROM public.todo_execution_templates WHERE slot_key = 'a1000000-0000-0000-0000-000000000005') = 1, 'new version keeps batch_id';

  -- Same call again: no new rows (idempotent).
  SELECT count(*) INTO c FROM public.todo_execution_templates;
  PERFORM public.revise_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', ARRAY['a1000000-0000-0000-0000-000000000005']::uuid[], current_date + 7, 'fixed', '07:00', '08:00');
  ASSERT (SELECT count(*) FROM public.todo_execution_templates) = c, 'repeat revision adds nothing';

  -- Whole batch from today: later Friday version is replaced, overall end preserved (open-ended).
  n := public.revise_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', NULL, current_date, 'window', NULL, NULL, '18:00', '22:00', 60);
  ASSERT n = 3, 'three slots changed';
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000a' AND starts_on = current_date AND execution_mode = 'window' AND ends_on IS NULL) = 3, 'new open-ended versions from today';
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000a' AND starts_on > current_date) = 0, 'superseded future version removed';
  ASSERT (SELECT execution_mode FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000b') = 'fixed', 'independent series still untouched';

  -- History is never rewritten.
  BEGIN
    PERFORM public.revise_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', NULL, current_date - 10, 'fixed', '06:00', '07:00');
    RAISE EXCEPTION 'past date must be refused';
  EXCEPTION WHEN others THEN ASSERT SQLERRM LIKE 'Effective date%', SQLERRM;
  END;
  -- A slot of another batch cannot be addressed through this batch.
  BEGIN
    PERFORM public.revise_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', ARRAY['a1000000-0000-0000-0000-0000000000f1']::uuid[], current_date, 'fixed', '06:00', '07:00');
    RAISE EXCEPTION 'foreign slot must be refused';
  EXCEPTION WHEN others THEN ASSERT SQLERRM LIKE 'Slot does not belong%', SQLERRM;
  END;

  -- Stop only Wednesday from next week; repeat is a no-op.
  n := public.stop_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', ARRAY['a1000000-0000-0000-0000-000000000003']::uuid[], current_date + 7);
  ASSERT n >= 1, 'stop changed something';
  n := public.stop_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', ARRAY['a1000000-0000-0000-0000-000000000003']::uuid[], current_date + 7);
  ASSERT n = 0, 'second stop is a no-op';
  ASSERT (SELECT max(ends_on) FROM public.todo_execution_templates WHERE slot_key = 'a1000000-0000-0000-0000-000000000003') = current_date + 6, 'Wednesday ends the day before';
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE slot_key = 'a1000000-0000-0000-0000-000000000001' AND ends_on IS NULL) = 1, 'Monday continues';

  -- v3 revision keeps batch identity too.
  PERFORM public.revise_execution_template_v3((SELECT id FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000b'), current_date + 3, 'fixed', '09:00', '10:00');
  ASSERT (SELECT count(*) FROM public.todo_execution_templates WHERE batch_id = 'b1000000-0000-0000-0000-00000000000b') = 2, 'v3 new version keeps batch_id';
  RAISE NOTICE 'PASS series identity: slot-only change, whole-batch change, independent series untouched, idempotent, history protected';
END
$t$;

-- Versions of one slot can never overlap, even when inserted directly.
DO $t$
BEGIN
  BEGIN
    INSERT INTO public.todo_execution_templates(todo_id, slot_key, batch_id, starts_on, execution_mode, selector_kind, selector_value, start_time, end_time)
    VALUES ('22222222-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', current_date + 30, 'fixed', 'weekday', 1, '06:00', '07:00');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'overlapping version must be refused';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS series identity: overlapping slot versions refused';
END
$t$;

-- Another user cannot change the series.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $t$
BEGIN
  BEGIN
    PERFORM public.stop_execution_batch_v4('b1000000-0000-0000-0000-00000000000a', NULL, current_date);
    RAISE EXCEPTION 'B must not stop A''s series';
  EXCEPTION WHEN others THEN ASSERT SQLERRM LIKE 'Series not found%', SQLERRM;
  END;
  RAISE NOTICE 'PASS series identity: owner isolation';
END
$t$;
RESET ROLE;
