-- Tests for space_sharing_v1_00 + v1_01 (issue 15). Run by supabase/tests/run.sh.
-- Users: a (Spaces A, B), b (Space A), c (Spaces B, C).
\set ON_ERROR_STOP on
SET ROLE authenticated;

-- ---------- as a: create and share ----------
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $t$
DECLARE
  sa uuid := 'a0000000-0000-0000-0000-00000000000a';
  sb uuid := 'b0000000-0000-0000-0000-00000000000b';
  sc uuid := 'c0000000-0000-0000-0000-00000000000c';
  t1 uuid; r1 uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.todo_space_shares
          WHERE todo_id = '5a000000-0000-0000-0000-000000000001' AND group_id = sa) = 1,
         'legacy todos.group_id backfilled';

  INSERT INTO public.todos(user_id, title, description, task_date, task_type)
  VALUES (auth.uid(), 'Thesis reading', 'private link https://x', current_date, 'one_time')
  RETURNING id INTO t1;
  PERFORM public.set_task_sharing(t1, ARRAY[sa, sb], true, false);
  ASSERT (SELECT count(*) FROM public.todo_space_shares WHERE todo_id = t1) = 2, 'shared to two spaces';

  BEGIN
    PERFORM public.set_task_sharing(t1, ARRAY[sc], true, false);
    RAISE EXCEPTION 'sharing to a non-member space must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.todo_space_shares WHERE todo_id = t1) = 2, 'failed call changed nothing';

  BEGIN
    INSERT INTO public.todo_space_shares(todo_id, group_id) VALUES (t1, sc);
    RAISE EXCEPTION 'direct insert into a non-member space must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.todos(user_id, title, task_date, task_type)
  VALUES (auth.uid(), 'Run', current_date, 'routine') RETURNING id INTO r1;
  INSERT INTO public.habit_patterns_v3(todo_id, period, arrangement, target_count, starts_on)
  VALUES (r1, 'week', 'flexible', 3, current_date - 7);
  INSERT INTO public.habit_logs(todo_id, occurred_on) VALUES (r1, current_date);
  INSERT INTO public.focus_entries(todo_id, client_event_id, started_at, ended_at, duration_seconds)
  VALUES (r1, gen_random_uuid(), now(), now() + interval '30 minutes', 1800);
  PERFORM public.set_task_sharing(r1, ARRAY[sa], false, true);

  PERFORM set_config('os.t1', t1::text, false);
  PERFORM set_config('os.r1', r1::text, false);
  RAISE NOTICE 'PASS owner: backfill, multi-space share, non-member space refused';
END
$t$;

-- ---------- as b (Space A only) ----------
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $t$
DECLARE
  sa uuid := 'a0000000-0000-0000-0000-00000000000a';
  sb uuid := 'b0000000-0000-0000-0000-00000000000b';
  t1 uuid := current_setting('os.t1')::uuid;
  r1 uuid := current_setting('os.r1')::uuid;
  rec record;
BEGIN
  ASSERT (SELECT count(*) FROM public.todos WHERE user_id <> auth.uid()) = 0, 'todos table is owner-only';
  ASSERT (SELECT count(*) FROM public.todo_space_shares) = 0, 'share rows are not readable by friends';

  SELECT * INTO rec FROM public.get_space_shared_tasks(sa, current_date) WHERE todo_id = t1;
  ASSERT rec.title = 'Thesis reading', 'friend sees the shared task';
  ASSERT rec.description = 'private link https://x', 'description visible when share_description';
  ASSERT rec.completed IS NULL AND rec.focus_minutes IS NULL, 'progress hidden when share_progress = false';

  SELECT * INTO rec FROM public.get_space_shared_tasks(sa, current_date) WHERE todo_id = r1;
  ASSERT rec.description IS NULL, 'description hidden when share_description = false';
  ASSERT rec.routine_period = 'week' AND rec.routine_target = 3, 'routine itself is shown';
  ASSERT rec.completed AND rec.today_count = 1 AND rec.focus_minutes = 30, 'progress shown when share_progress';

  BEGIN
    PERFORM * FROM public.get_space_shared_tasks(sb, current_date);
    RAISE EXCEPTION 'non-member must not read Space B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS friend: owner-only table, field gating by switches, routine progress, non-member refused';
END
$t$;

-- ---------- as c (Space B): sees t1, not r1 ----------
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
DO $t$
DECLARE sb uuid := 'b0000000-0000-0000-0000-00000000000b';
BEGIN
  ASSERT (SELECT count(*) FROM public.get_space_shared_tasks(sb, current_date)
          WHERE todo_id = current_setting('os.t1')::uuid) = 1, 'second space sees the task';
  ASSERT (SELECT count(*) FROM public.get_space_shared_tasks(sb, current_date)
          WHERE todo_id = current_setting('os.r1')::uuid) = 0, 'task shared only to A is not in B';
  RAISE NOTICE 'PASS scope: per-space visibility';
END
$t$;

-- ---------- a makes t1 private, then a leaves Space B ----------
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $t$
DECLARE
  sa uuid := 'a0000000-0000-0000-0000-00000000000a';
  sb uuid := 'b0000000-0000-0000-0000-00000000000b';
  t1 uuid := current_setting('os.t1')::uuid;
  r1 uuid := current_setting('os.r1')::uuid;
BEGIN
  PERFORM public.set_task_sharing(t1, '{}', true, false);
  ASSERT (SELECT count(*) FROM public.todo_space_shares WHERE todo_id = t1) = 0, 'private removes all shares';
  ASSERT (SELECT count(*) FROM public.get_space_shared_tasks(sa, current_date) WHERE todo_id = t1) = 0,
         'private task disappears from the space';

  PERFORM public.set_task_sharing(t1, ARRAY[sa, sb], true, false);
  DELETE FROM public.group_members WHERE group_id = sb AND user_id = auth.uid();
  ASSERT (SELECT array_agg(group_id) FROM public.todo_space_shares WHERE todo_id = t1) = ARRAY[sa],
         'leaving Space B unshares from B only';
  ASSERT (SELECT count(*) FROM public.todo_space_shares WHERE todo_id = r1) = 1, 'other shares untouched';
  RAISE NOTICE 'PASS lifecycle: back to private, leave space unshares';
END
$t$;
RESET ROLE;
