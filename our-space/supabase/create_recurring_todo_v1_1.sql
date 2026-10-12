-- Atomic Todo + recurrence rule creation.
-- Apply after schedule_rules exists. Uses caller RLS and auth.uid().
BEGIN;
CREATE OR REPLACE FUNCTION public.create_recurring_todo(
  p_title text,
  p_description text,
  p_estimated_minutes integer,
  p_task_date date,
  p_category text,
  p_custom_tag text,
  p_group_id uuid,
  p_cadence text,
  p_weekdays smallint[],
  p_times_per_week smallint,
  p_ends_on date,
  p_timezone text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_cadence NOT IN ('daily', 'weekly_days', 'weekly_quota') THEN
    RAISE EXCEPTION 'Invalid cadence';
  END IF;
  IF p_ends_on IS NOT NULL AND p_ends_on < p_task_date THEN
    RAISE EXCEPTION 'Repeat end before start';
  END IF;
  IF p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not a member of selected group'; END IF;
  INSERT INTO public.todos (
    user_id, group_id, title, description, estimated_minutes,
    task_date, category, custom_tag
  ) VALUES (
    auth.uid(), p_group_id, p_title, p_description, p_estimated_minutes,
    p_task_date, p_category, p_custom_tag
  ) RETURNING id INTO v_id;
  INSERT INTO public.schedule_rules (
    todo_id, cadence, weekdays, times_per_week, target_minutes,
    timezone, starts_on, ends_on, status
  ) VALUES (
    v_id, p_cadence, COALESCE(p_weekdays, '{}'::smallint[]),
    p_times_per_week, p_estimated_minutes,
    COALESCE(NULLIF(p_timezone,''), 'UTC'), p_task_date, p_ends_on, 'active'
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_recurring_todo(text,text,integer,date,text,text,uuid,text,smallint[],smallint,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_todo(text,text,integer,date,text,text,uuid,text,smallint[],smallint,date,text) TO authenticated;
COMMIT;
