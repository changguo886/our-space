-- V4 atomic database task type cutover: only run AFTER client bundle is deployed/staged.
-- Requires v4_02 and v4_03. No DELETE. All changes roll back on error.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM public.todos WHERE task_type NOT IN ('one_time','habit','project','routine')) THEN
   RAISE EXCEPTION 'Unexpected legacy task type (recurring or unknown); inspect before migration';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='habit_patterns_v3' AND column_name='strict') THEN
   RAISE EXCEPTION 'Run v4_02 first';
 END IF;
END
$guard$;
-- Temporarily admit old and new values for migration within the transaction.
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_task_type_valid;
ALTER TABLE public.todos ADD CONSTRAINT todos_task_type_valid
 CHECK (task_type IN ('one_time','habit','project','routine'));
UPDATE public.todos SET task_type='project'
 WHERE task_type='one_time' AND plan_start_date IS NOT NULL AND target_finish_date IS NOT NULL;
UPDATE public.todos SET task_type='routine' WHERE task_type='habit';
-- Replace RLS on recurrence table: owner must match new routine, not legacy habit.
DROP POLICY IF EXISTS "habit patterns own select" ON public.habit_patterns_v3;
DROP POLICY IF EXISTS "habit patterns own insert" ON public.habit_patterns_v3;
DROP POLICY IF EXISTS "habit patterns own update" ON public.habit_patterns_v3;
DROP POLICY IF EXISTS "habit patterns own delete" ON public.habit_patterns_v3;
CREATE POLICY "routine rule own select" ON public.habit_patterns_v3 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=auth.uid() AND t.task_type='routine'));
CREATE POLICY "routine rule own insert" ON public.habit_patterns_v3 FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=auth.uid() AND t.task_type='routine'));
CREATE POLICY "routine rule own update" ON public.habit_patterns_v3 FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=auth.uid() AND t.task_type='routine'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=auth.uid() AND t.task_type='routine'));
CREATE POLICY "routine rule own delete" ON public.habit_patterns_v3 FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=auth.uid() AND t.task_type='routine'));
-- Replace writer in the SAME transaction to prevent the old mapping surviving after cutover.
CREATE OR REPLACE FUNCTION public.save_task_v4(payload jsonb, edit_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  saved uuid;
  kind text := payload->>'task_type';
  existing_kind text;
  stored_kind text;
  task_title text := nullif(btrim(payload->>'title'),'');
  start_on date := nullif(payload->>'plan_start_date','')::date;
  finish_on date := nullif(payload->>'target_finish_date','')::date;
  due_on date := nullif(payload->>'deadline_date','')::date;
  frequency_count integer := nullif(payload->>'target_count','')::integer;
  weekday_list smallint[] := ARRAY(SELECT v::smallint FROM jsonb_array_elements_text(coalesce(payload->'weekdays','[]'::jsonb)) AS v);
  monthday_list smallint[] := ARRAY(SELECT v::smallint FROM jsonb_array_elements_text(coalesce(payload->'month_days','[]'::jsonb)) AS v);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
  IF task_title IS NULL THEN RAISE EXCEPTION 'Title required'; END IF;
  IF kind IS NULL OR kind NOT IN ('one_time','project','routine') THEN RAISE EXCEPTION 'Unsupported kind'; END IF;
  stored_kind := kind;
  IF kind='project' AND (start_on IS NULL OR finish_on IS NULL OR finish_on<start_on) THEN RAISE EXCEPTION 'Invalid project range'; END IF;
  IF due_on IS NOT NULL AND finish_on IS NOT NULL AND due_on<finish_on THEN RAISE EXCEPTION 'Invalid deadline'; END IF;
  IF kind='routine' AND (coalesce((payload->>'period') NOT IN ('day','week','month'),true) OR
    coalesce((payload->>'arrangement') NOT IN ('fixed','flexible'),true) OR coalesce(frequency_count NOT BETWEEN 1 AND 10000,true))
  THEN RAISE EXCEPTION 'Invalid routine rule'; END IF;
  IF kind='routine' AND (payload->>'period')='week' AND (payload->>'arrangement')='fixed' AND frequency_count<>cardinality(weekday_list) THEN RAISE EXCEPTION 'Weekday count mismatch'; END IF;
  IF kind='routine' AND (payload->>'period')='month' AND (payload->>'arrangement')='fixed' AND cardinality(monthday_list)=0 AND NOT coalesce((payload->>'include_month_end')::boolean,false) THEN RAISE EXCEPTION 'Choose a monthly date'; END IF;
  IF edit_id IS NULL THEN
    INSERT INTO public.todos(user_id,title,description,group_id,category,custom_tag,task_type,task_date,
      plan_start_date,target_finish_date,deadline_date)
    VALUES(auth.uid(),task_title,nullif(payload->>'description',''),nullif(payload->>'group_id','')::uuid,
      nullif(payload->>'category',''),nullif(payload->>'custom_tag',''),stored_kind,
      coalesce(nullif(payload->>'task_date','')::date,current_date),
      CASE WHEN kind='project' THEN start_on END,CASE WHEN kind='project' THEN finish_on END,
      CASE WHEN kind='project' THEN due_on END) RETURNING id INTO saved;
  ELSE
    SELECT task_type INTO existing_kind FROM public.todos WHERE id=edit_id AND user_id=auth.uid() FOR UPDATE;
    IF existing_kind IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF existing_kind<>stored_kind THEN RAISE EXCEPTION 'Cross-family conversions need V4 cutover'; END IF;
    UPDATE public.todos SET title=task_title,description=nullif(payload->>'description',''),
      estimated_minutes=nullif(payload->>'estimated_minutes','')::integer,
      category=nullif(payload->>'category',''),custom_tag=nullif(payload->>'custom_tag',''),
      group_id=nullif(payload->>'group_id','')::uuid,
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
ALTER TABLE public.todos DROP CONSTRAINT todos_task_type_valid;
ALTER TABLE public.todos ADD CONSTRAINT todos_task_type_valid CHECK (task_type IN ('one_time','project','routine'));
COMMIT;
-- KEEP legacy save_habit_v3 temporarily for existing old clients, but it must no longer
-- be called: it attempts to insert task_type=habit and will fail after this switch.
