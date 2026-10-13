-- V3 M7: atomically revise a recurring execution time from an effective date.
-- Depends on M4 and M6. Never rewrites completed Focus/habit logs.
BEGIN;
CREATE OR REPLACE FUNCTION public.revise_execution_template_v3(
 p_template_id uuid, p_effective_on date, p_new_mode text,
 p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
 p_window_start time DEFAULT NULL, p_window_end time DEFAULT NULL,
 p_planned_minutes integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $body$
DECLARE
 previous public.todo_execution_templates%ROWTYPE;
 new_id uuid;
BEGIN
 SELECT * INTO previous FROM public.todo_execution_templates
 WHERE id=p_template_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.todos
   WHERE id=previous.todo_id AND user_id=(SELECT auth.uid()))
 THEN RAISE EXCEPTION 'Not permitted'; END IF;
 IF p_effective_on<previous.starts_on
    OR (previous.ends_on IS NOT NULL AND p_effective_on>previous.ends_on)
 THEN RAISE EXCEPTION 'Date outside template effective range'; END IF;
 IF p_new_mode NOT IN ('fixed','window','flexible') THEN
 RAISE EXCEPTION 'Invalid execution mode'; END IF;
 IF p_new_mode='fixed' AND
  (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time)
 THEN RAISE EXCEPTION 'Invalid same-day booked time'; END IF;
 IF p_new_mode='window' AND
  (p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start)
 THEN RAISE EXCEPTION 'Invalid time window'; END IF;
 IF p_new_mode IN ('window','flexible') AND
  (p_planned_minutes IS NULL OR p_planned_minutes NOT BETWEEN 1 AND 1440)
 THEN RAISE EXCEPTION 'Invalid effort minutes'; END IF;
 IF p_effective_on=previous.starts_on THEN
   UPDATE public.todo_execution_templates SET
    execution_mode=p_new_mode,
    start_time=CASE WHEN p_new_mode='fixed' THEN p_start_time ELSE NULL END,
    end_time=CASE WHEN p_new_mode='fixed' THEN p_end_time ELSE NULL END,
    window_start=CASE WHEN p_new_mode='window' THEN p_window_start ELSE NULL END,
    window_end=CASE WHEN p_new_mode='window' THEN p_window_end ELSE NULL END,
    planned_minutes=CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END,
    updated_at=now()
   WHERE id=previous.id;
   RETURN previous.id;
 END IF;
 UPDATE public.todo_execution_templates
   SET ends_on=p_effective_on-1,updated_at=now()
   WHERE id=previous.id;
 INSERT INTO public.todo_execution_templates(
   todo_id,slot_key,starts_on,ends_on,start_time,end_time,timezone,
   execution_mode,selector_kind,selector_value,planned_minutes,
   window_start,window_end
 ) VALUES(
   previous.todo_id,previous.slot_key,p_effective_on,previous.ends_on,
   CASE WHEN p_new_mode='fixed' THEN p_start_time ELSE NULL END,
   CASE WHEN p_new_mode='fixed' THEN p_end_time ELSE NULL END,
   previous.timezone,p_new_mode,previous.selector_kind,previous.selector_value,
   CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END,
   CASE WHEN p_new_mode='window' THEN p_window_start ELSE NULL END,
   CASE WHEN p_new_mode='window' THEN p_window_end ELSE NULL END
 ) RETURNING id INTO new_id;
 RETURN new_id;
END $body$;
REVOKE ALL ON FUNCTION public.revise_execution_template_v3(uuid,date,text,time,time,time,time,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_execution_template_v3(uuid,date,text,time,time,time,time,integer) TO authenticated;
COMMIT;
