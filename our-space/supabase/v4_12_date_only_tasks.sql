-- =====================================================================================
-- Our Space V4.12 — Date-only and undated one-time tasks (Phase 3)
-- Status: REVIEW BEFORE RUNNING. Not executed by any tool.
-- =====================================================================================
--
-- 影响范围 / Scope
--   * public.todos.task_date becomes NULLABLE. Meaning (unchanged for existing rows):
--       task_date = D     → "do it on day D", no time reserved (date-only to-do)
--       task_date = NULL  → undated one-time task (shows under 未安排)
--   * + CHECK todos_dated_unless_one_time: only one_time tasks may be undated; project/routine keep a date.
--   * save_task_v4 replaced (same signature):
--       - payload WITHOUT a "task_date" key behaves exactly as before (defaults to today) — old clients safe;
--       - payload with "task_date": null creates/edits an undated one_time task;
--       - editing can now change task_date (previously ignored);
--       - estimated_minutes is now saved on create too (it was silently dropped on insert before).
--   * No existing row changes. Rows that were auto-filled with "today" in the past cannot be told apart
--     from deliberately dated ones; they stay dated (no guessing).
--
-- 身份 / Identity: rows addressed by todos.id only. No data inferred from timestamps.
--
-- 读取方审查 / Reader audit done on branch fix/v4-schedule-review (2026-10-13):
--   today/page, todo/page, OverdueTodoList, TaskBoardV2, CalendarViews, CalendarPlanner, TodoList:
--   null-safe comparisons (null never equals or precedes a date). HistoryView grouped by task_date —
--   fixed in the same release to fall back to the completion/creation day. Desktop (Tauri) focus pages
--   do not read task_date.
--
-- 前置条件 / Prerequisites: v4_04 (save_task_v4 + task_type cutover).
--
-- 只读预检 / Read-only preflight
--   -- P1 column currently NOT NULL (expect 'NO'):
--   SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='task_date';
--   -- P2 non-one_time rows without a date (must be 0 for the CHECK):
--   SELECT count(*) FROM public.todos WHERE task_type <> 'one_time' AND task_date IS NULL;
--   -- P3 current save_task_v4 definition, saved for rollback:
--   SELECT pg_get_functiondef('public.save_task_v4(jsonb,uuid)'::regprocedure);
--   -- P4 views or functions depending on todos.task_date (review the list):
--   SELECT DISTINCT p.proname FROM pg_proc p WHERE p.prosrc ILIKE '%task_date%';
--
-- 备份要求 / Backup: Supabase backup < 24h, or pg_dump of public.todos; P3 output saved.
-- 执行顺序 / Order: after v4_11. Deploy the Phase 3 app code AFTER this file (the app sends
--   "task_date": null only when the user picks 不定日期).
-- 回滚 / Rollback: ROLLBACK-BEGIN … ROLLBACK-END below. Undated rows must get a date again before NOT NULL
--   can return; the rollback uses each row's creation day and lists them first (information loss: the
--   "undated" choice).
-- =====================================================================================

BEGIN;

ALTER TABLE public.todos ALTER COLUMN task_date DROP NOT NULL;
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_dated_unless_one_time;
ALTER TABLE public.todos ADD CONSTRAINT todos_dated_unless_one_time CHECK (task_type = 'one_time' OR task_date IS NOT NULL);

CREATE OR REPLACE FUNCTION public.save_task_v4(payload jsonb, edit_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  saved uuid;
  kind text := payload->>'task_type';
  existing_kind text;
  task_title text := nullif(btrim(payload->>'title'),'');
  start_on date := nullif(payload->>'plan_start_date','')::date;
  finish_on date := nullif(payload->>'target_finish_date','')::date;
  due_on date := nullif(payload->>'deadline_date','')::date;
  frequency_count integer := nullif(payload->>'target_count','')::integer;
  weekday_list smallint[] := ARRAY(SELECT v::smallint FROM jsonb_array_elements_text(coalesce(payload->'weekdays','[]'::jsonb)) AS v);
  monthday_list smallint[] := ARRAY(SELECT v::smallint FROM jsonb_array_elements_text(coalesce(payload->'month_days','[]'::jsonb)) AS v);
  has_date_key boolean := payload ? 'task_date';
  given_date date := nullif(payload->>'task_date','')::date;
  new_date date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
  IF task_title IS NULL THEN RAISE EXCEPTION 'Title required'; END IF;
  IF kind IS NULL OR kind NOT IN ('one_time','project','routine') THEN RAISE EXCEPTION 'Unsupported kind'; END IF;
  IF kind='project' AND (start_on IS NULL OR finish_on IS NULL OR finish_on<start_on) THEN RAISE EXCEPTION 'Invalid project range'; END IF;
  IF due_on IS NOT NULL AND finish_on IS NOT NULL AND due_on<finish_on THEN RAISE EXCEPTION 'Invalid deadline'; END IF;
  IF kind='routine' AND (coalesce((payload->>'period') NOT IN ('day','week','month'),true) OR
    coalesce((payload->>'arrangement') NOT IN ('fixed','flexible'),true) OR coalesce(frequency_count NOT BETWEEN 1 AND 10000,true))
  THEN RAISE EXCEPTION 'Invalid routine rule'; END IF;
  IF kind='routine' AND (payload->>'period')='week' AND (payload->>'arrangement')='fixed' AND frequency_count<>cardinality(weekday_list) THEN RAISE EXCEPTION 'Weekday count mismatch'; END IF;
  IF kind='routine' AND (payload->>'period')='month' AND (payload->>'arrangement')='fixed' AND cardinality(monthday_list)=0 AND NOT coalesce((payload->>'include_month_end')::boolean,false) THEN RAISE EXCEPTION 'Choose a monthly date'; END IF;

  -- Date rule: only one_time tasks may be undated, and only when the caller says so explicitly.
  new_date := CASE
    WHEN kind = 'one_time' AND has_date_key THEN given_date
    WHEN kind = 'project' THEN coalesce(given_date, start_on, current_date)
    ELSE coalesce(given_date, current_date)
  END;

  IF edit_id IS NULL THEN
    INSERT INTO public.todos(user_id,title,description,group_id,category,custom_tag,task_type,task_date,estimated_minutes,
      plan_start_date,target_finish_date,deadline_date)
    VALUES(auth.uid(),task_title,nullif(payload->>'description',''),nullif(payload->>'group_id','')::uuid,
      nullif(payload->>'category',''),nullif(payload->>'custom_tag',''),kind,new_date,
      nullif(payload->>'estimated_minutes','')::integer,
      CASE WHEN kind='project' THEN start_on END,CASE WHEN kind='project' THEN finish_on END,
      CASE WHEN kind='project' THEN due_on END) RETURNING id INTO saved;
  ELSE
    SELECT task_type INTO existing_kind FROM public.todos WHERE id=edit_id AND user_id=auth.uid() FOR UPDATE;
    IF existing_kind IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF existing_kind<>kind THEN RAISE EXCEPTION 'Cross-family conversions need V4 cutover'; END IF;
    UPDATE public.todos SET title=task_title,description=nullif(payload->>'description',''),
      estimated_minutes=nullif(payload->>'estimated_minutes','')::integer,
      category=nullif(payload->>'category',''),custom_tag=nullif(payload->>'custom_tag',''),
      group_id=nullif(payload->>'group_id','')::uuid,
      task_date=CASE WHEN has_date_key THEN new_date ELSE task_date END,
      plan_start_date=CASE WHEN kind='project' THEN start_on END,
      target_finish_date=CASE WHEN kind='project' THEN finish_on END,
      deadline_date=CASE WHEN kind='project' THEN due_on END,updated_at=now()
    WHERE id=edit_id AND user_id=auth.uid() RETURNING id INTO saved;
  END IF;
  IF kind='routine' THEN
    INSERT INTO public.habit_patterns_v3(todo_id,period,arrangement,target_count,weekdays,month_days,
      include_month_end,starts_on,ends_on,strict)
    VALUES(saved,payload->>'period',payload->>'arrangement',frequency_count,weekday_list,monthday_list,
      coalesce((payload->>'include_month_end')::boolean,false),
      coalesce(nullif(payload->>'starts_on','')::date,(SELECT h.starts_on FROM public.habit_patterns_v3 h WHERE h.todo_id=saved)),
      coalesce(nullif(payload->>'ends_on','')::date,(SELECT h.ends_on FROM public.habit_patterns_v3 h WHERE h.todo_id=saved)),
      coalesce((payload->>'strict')::boolean,(SELECT h.strict FROM public.habit_patterns_v3 h WHERE h.todo_id=saved),false))
    ON CONFLICT(todo_id) DO UPDATE SET period=excluded.period,arrangement=excluded.arrangement,
      target_count=excluded.target_count,weekdays=excluded.weekdays,month_days=excluded.month_days,
      include_month_end=excluded.include_month_end,starts_on=excluded.starts_on,
      ends_on=excluded.ends_on,strict=excluded.strict,updated_at=now();
  END IF;
  RETURN saved;
END
$fn$;
REVOKE ALL ON FUNCTION public.save_task_v4(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_task_v4(jsonb,uuid) TO authenticated;

COMMIT;

-- 验证 / Post-checks
--   SELECT is_nullable FROM information_schema.columns WHERE table_name='todos' AND column_name='task_date';  -- 'YES'

-- ROLLBACK-BEGIN
-- BEGIN;
-- -- 1) list rows that will get a date again (review!), then give each its creation day
-- SELECT id, title FROM public.todos WHERE task_date IS NULL;
-- UPDATE public.todos SET task_date = created_at::date WHERE task_date IS NULL;
-- ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_dated_unless_one_time;
-- ALTER TABLE public.todos ALTER COLUMN task_date SET NOT NULL;
-- -- 2) restore the previous save_task_v4: in the Supabase SQL editor paste the saved P3 output here.
-- --    (psql users and the test runner: \i with the saved file)
-- \i save_task_v4_previous.sql
-- COMMIT;
-- ROLLBACK-END
