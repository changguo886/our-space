-- Tests for v4_12 (date-only and undated one-time tasks). Run by supabase/tests/run.sh.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $t$
DECLARE a uuid; b uuid; c uuid; r uuid; p uuid;
BEGIN
  a := public.save_task_v4('{"task_type":"one_time","title":"No key","estimated_minutes":"25"}');
  ASSERT (SELECT task_date FROM public.todos WHERE id = a) = current_date, 'no task_date key: old behaviour (today)';
  ASSERT (SELECT estimated_minutes FROM public.todos WHERE id = a) = 25, 'estimated_minutes saved on create';
  b := public.save_task_v4('{"task_type":"one_time","title":"Buy phone","task_date":null}');
  ASSERT (SELECT task_date FROM public.todos WHERE id = b) IS NULL, 'explicit null: undated one-time task';
  c := public.save_task_v4('{"task_type":"one_time","title":"Pick up parcel","task_date":"2026-12-24"}');
  ASSERT (SELECT task_date FROM public.todos WHERE id = c) = '2026-12-24', 'date-only task';
  PERFORM public.save_task_v4('{"task_type":"one_time","title":"Pick up parcel","task_date":null}', c);
  ASSERT (SELECT task_date FROM public.todos WHERE id = c) IS NULL, 'edit can remove the date';
  PERFORM public.save_task_v4('{"task_type":"one_time","title":"Pick up parcel again"}', c);
  ASSERT (SELECT task_date FROM public.todos WHERE id = c) IS NULL, 'edit without the key keeps the date as is';
  r := public.save_task_v4('{"task_type":"routine","title":"Run","task_date":null,"period":"week","arrangement":"flexible","target_count":"3"}');
  ASSERT (SELECT task_date FROM public.todos WHERE id = r) = current_date, 'routines always keep a date';
  p := public.save_task_v4('{"task_type":"project","title":"Thesis","task_date":null,"plan_start_date":"2026-10-20","target_finish_date":"2026-11-30"}');
  ASSERT (SELECT task_date FROM public.todos WHERE id = p) = '2026-10-20', 'projects anchor on their start date';
  BEGIN
    UPDATE public.todos SET task_date = NULL WHERE id = r;
    RAISE EXCEPTION 'undated routine must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS date-only: undated one-time, date-only, back-compat default, edit, routine/project keep a date';
END
$t$;
RESET ROLE;
