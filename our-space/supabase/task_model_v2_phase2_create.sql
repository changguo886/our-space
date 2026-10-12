-- Task Model V2 phase 2: atomic creation for recurring tasks and habits.
-- Apply to STAGING only after task_model_v2_phase1.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_scheduled_todo_v2(
 p_title text, p_description text, p_estimated_minutes integer,
 p_task_date date, p_category text, p_custom_tag text, p_group_id uuid,
 p_task_type text, p_cadence text, p_weekdays smallint[],
 p_times_per_week smallint, p_ends_on date, p_timezone text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_task_type NOT IN ('recurring','habit') OR p_task_type IS NULL THEN
   RAISE EXCEPTION 'Invalid scheduled task type';
 END IF;
 IF p_cadence NOT IN ('daily','weekly_days','weekly_quota') OR p_cadence IS NULL THEN
   RAISE EXCEPTION 'Invalid cadence';
 END IF;
 IF p_cadence = 'weekly_days' AND (coalesce(array_length(p_weekdays,1),0)=0
      OR EXISTS (SELECT 1 FROM unnest(p_weekdays) w WHERE w < 1 OR w > 7)) THEN
   RAISE EXCEPTION 'Invalid weekdays';
 END IF;
 IF p_cadence = 'weekly_quota' AND (p_times_per_week IS NULL OR p_times_per_week < 1 OR p_times_per_week > 7) THEN
   RAISE EXCEPTION 'Invalid weekly quota';
 END IF;
 IF p_ends_on IS NOT NULL AND p_ends_on < p_task_date THEN RAISE EXCEPTION 'Invalid end date'; END IF;
 IF p_group_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id=auth.uid()
 ) THEN RAISE EXCEPTION 'Not a member of group'; END IF;
 INSERT INTO public.todos (
   user_id,group_id,title,description,estimated_minutes,
   task_date,category,custom_tag,task_type
 ) VALUES (
   auth.uid(),p_group_id,p_title,p_description,p_estimated_minutes,
   p_task_date,p_category,p_custom_tag,p_task_type
 ) RETURNING id INTO v_id;
 INSERT INTO public.schedule_rules (
   todo_id,cadence,weekdays,times_per_week,target_minutes,
   timezone,starts_on,ends_on,status
 ) VALUES (
   v_id,p_cadence,
   CASE WHEN p_cadence='weekly_days' THEN p_weekdays ELSE '{}'::smallint[] END,
   CASE WHEN p_cadence='weekly_quota' THEN p_times_per_week ELSE NULL END,
   p_estimated_minutes,coalesce(nullif(p_timezone,''),'UTC'),p_task_date,p_ends_on,'active'
 );
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_scheduled_todo_v2(text,text,integer,date,text,text,uuid,text,text,smallint[],smallint,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_scheduled_todo_v2(text,text,integer,date,text,text,uuid,text,text,smallint[],smallint,date,text) TO authenticated;
COMMIT;
