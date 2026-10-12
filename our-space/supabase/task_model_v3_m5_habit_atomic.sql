-- M5: atomic habit create/update. Apply only after read-only preflight.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_habit_v3(payload jsonb, edit_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  saved_id uuid;
  pattern_period text := payload->>'period';
  pattern_mode text := payload->>'arrangement';
  count_goal integer := (payload->>'target_count')::integer;
  chosen_weekdays smallint[] := ARRAY(SELECT value::smallint FROM jsonb_array_elements_text(coalesce(payload->'weekdays','[]'::jsonb)) AS value);
  chosen_month_days smallint[] := ARRAY(SELECT value::smallint FROM jsonb_array_elements_text(coalesce(payload->'month_days','[]'::jsonb)) AS value);
  month_last boolean := coalesce((payload->>'include_month_end')::boolean,false);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
  IF nullif(btrim(payload->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Title required'; END IF;
  IF pattern_period NOT IN ('day','week','month') OR pattern_mode NOT IN ('fixed','flexible') OR count_goal NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid habit settings';
  END IF;
  IF pattern_period='day' AND pattern_mode='fixed' THEN RAISE EXCEPTION 'Daily mode must be flexible'; END IF;
  IF pattern_period='week' AND pattern_mode='fixed' AND count_goal<>cardinality(chosen_weekdays) THEN RAISE EXCEPTION 'Weekday count mismatch'; END IF;
  IF pattern_period='month' AND pattern_mode='fixed' AND cardinality(chosen_month_days)=0 AND NOT month_last THEN RAISE EXCEPTION 'Select monthly dates'; END IF;
  IF edit_id IS NULL THEN
    INSERT INTO public.todos(user_id,title,description,task_date,estimated_minutes,category,custom_tag,group_id,task_type)
    VALUES(auth.uid(),payload->>'title',nullif(payload->>'description',''),(payload->>'task_date')::date,
    nullif(payload->>'estimated_minutes','')::integer,nullif(payload->>'category',''),
    nullif(payload->>'custom_tag',''),nullif(payload->>'group_id','')::uuid,'habit')
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.todos SET title=payload->>'title',description=nullif(payload->>'description',''),
    task_date=(payload->>'task_date')::date,estimated_minutes=nullif(payload->>'estimated_minutes','')::integer,
    category=nullif(payload->>'category',''),custom_tag=nullif(payload->>'custom_tag',''),
    group_id=nullif(payload->>'group_id','')::uuid
    WHERE id=edit_id AND user_id=auth.uid() AND task_type='habit' RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Habit not found'; END IF;
  END IF;
  INSERT INTO public.habit_patterns_v3(todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end)
  VALUES(saved_id,pattern_period,pattern_mode,count_goal,chosen_weekdays,chosen_month_days,month_last)
  ON CONFLICT(todo_id) DO UPDATE SET period=EXCLUDED.period,arrangement=EXCLUDED.arrangement,
  target_count=EXCLUDED.target_count,weekdays=EXCLUDED.weekdays,month_days=EXCLUDED.month_days,
  include_month_end=EXCLUDED.include_month_end,updated_at=now();
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_habit_v3(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_habit_v3(jsonb,uuid) TO authenticated;
COMMIT;
