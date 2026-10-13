-- =====================================================================================
-- Our Space V4.11 — Repeating series identity (Phase 2)
-- Status: REVIEW BEFORE RUNNING. Not executed by any tool.
-- =====================================================================================
--
-- 影响范围 / Scope
--   * public.todo_execution_templates: + batch_id uuid NOT NULL (default gen_random_uuid()).
--     Existing rows: batch_id := slot_key, i.e. every existing slot is its own group. Batches are NOT
--     reconstructed from created_at or matching times (identity is never guessed).
--   * + EXCLUDE constraint todo_execution_templates_slot_versions_disjoint: two versions of the same
--     slot (todo_id, slot_key) may not cover the same date. Requires extension btree_gist.
--   * revise_execution_template_v3: same behaviour, but the new version keeps the batch_id.
--   * New RPCs revise_execution_batch_v4 / stop_execution_batch_v4: change or stop named slots of one
--     batch from a date, in ONE transaction. Re-running the same call changes nothing further.
--   * No rows are deleted except future versions that a revision explicitly replaces.
--
-- 身份 / Identity levels
--   batch_id  = one save (e.g. Mon/Wed/Fri created together)
--   slot_key  = one repeating time slot; every revision of it keeps the same slot_key
--   id        = one version of a slot over [starts_on, ends_on]
--   One occurrence = (todo_id, slot_key, occurrence_date) in todo_execution_overrides (unchanged).
--
-- 幂等 / Idempotency
--   * revise: the version that starts on the effective date is updated in place; running the same
--     revision twice leaves one version with the same values.
--   * stop: versions starting on/after the date are removed, the covering one ends the day before;
--     running it again finds nothing to change.
--   * Both refuse dates earlier than yesterday (history is never rewritten).
--
-- 前置条件 / Prerequisites: M4, M6, M7 applied (templates + revise/stop v3).
--
-- 只读预检 / Read-only preflight
--   -- P1 btree_gist available (expect 1 row):
--   SELECT name, installed_version FROM pg_available_extensions WHERE name = 'btree_gist';
--   -- P2 overlapping versions of one slot (MUST be 0 rows, otherwise fix them first):
--   SELECT a.todo_id, a.slot_key, a.id, b.id FROM public.todo_execution_templates a
--     JOIN public.todo_execution_templates b ON a.todo_id = b.todo_id AND a.slot_key = b.slot_key AND a.id < b.id
--    WHERE daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');
--   -- P3 column not present yet (expect 0 rows):
--   SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todo_execution_templates' AND column_name='batch_id';
--   -- P4 current revise_execution_template_v3, saved for rollback:
--   SELECT pg_get_functiondef('public.revise_execution_template_v3(uuid,date,text,time,time,time,time,integer)'::regprocedure);
--
-- 备份要求 / Backup: Supabase backup < 24h, or pg_dump of public.todo_execution_templates; P4 output saved.
-- 执行顺序 / Order: after v4_10 (independent of it); deploy Phase 2 app code after this file.
--   App code before Phase 2 keeps working (it ignores batch_id; the default fills it).
-- 回滚 / Rollback: block between ROLLBACK-BEGIN and ROLLBACK-END at the end of this file.
-- =====================================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.todo_execution_templates ADD COLUMN IF NOT EXISTS batch_id uuid;
UPDATE public.todo_execution_templates SET batch_id = slot_key WHERE batch_id IS NULL;
ALTER TABLE public.todo_execution_templates ALTER COLUMN batch_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.todo_execution_templates ALTER COLUMN batch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS todo_execution_templates_batch_idx ON public.todo_execution_templates(todo_id, batch_id);

ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS todo_execution_templates_slot_versions_disjoint;
ALTER TABLE public.todo_execution_templates ADD CONSTRAINT todo_execution_templates_slot_versions_disjoint
  EXCLUDE USING gist (todo_id WITH =, slot_key WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
  DEFERRABLE INITIALLY DEFERRED;

-- revise v3: identical to M7 except the new version carries batch_id.
CREATE OR REPLACE FUNCTION public.revise_execution_template_v3(
 p_template_id uuid, p_effective_on date, p_new_mode text,
 p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
 p_window_start time DEFAULT NULL, p_window_end time DEFAULT NULL,
 p_planned_minutes integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE
 previous public.todo_execution_templates%ROWTYPE;
 new_id uuid;
BEGIN
 SELECT * INTO previous FROM public.todo_execution_templates WHERE id=p_template_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.todos WHERE id=previous.todo_id AND user_id=(SELECT auth.uid())) THEN RAISE EXCEPTION 'Not permitted'; END IF;
 IF p_effective_on<previous.starts_on OR (previous.ends_on IS NOT NULL AND p_effective_on>previous.ends_on) THEN RAISE EXCEPTION 'Date outside template effective range'; END IF;
 IF p_new_mode NOT IN ('fixed','window','flexible') THEN RAISE EXCEPTION 'Invalid execution mode'; END IF;
 IF p_new_mode='fixed' AND (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time) THEN RAISE EXCEPTION 'Invalid same-day booked time'; END IF;
 IF p_new_mode='window' AND (p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start) THEN RAISE EXCEPTION 'Invalid time window'; END IF;
 IF p_new_mode IN ('window','flexible') AND (p_planned_minutes IS NULL OR p_planned_minutes NOT BETWEEN 1 AND 1440) THEN RAISE EXCEPTION 'Invalid effort minutes'; END IF;
 IF p_effective_on=previous.starts_on THEN
   UPDATE public.todo_execution_templates SET
    execution_mode=p_new_mode,
    start_time=CASE WHEN p_new_mode='fixed' THEN p_start_time END, end_time=CASE WHEN p_new_mode='fixed' THEN p_end_time END,
    window_start=CASE WHEN p_new_mode='window' THEN p_window_start END, window_end=CASE WHEN p_new_mode='window' THEN p_window_end END,
    planned_minutes=CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END, updated_at=now()
   WHERE id=previous.id;
   RETURN previous.id;
 END IF;
 UPDATE public.todo_execution_templates SET ends_on=p_effective_on-1, updated_at=now() WHERE id=previous.id;
 INSERT INTO public.todo_execution_templates(
   todo_id,slot_key,batch_id,starts_on,ends_on,start_time,end_time,timezone,
   execution_mode,selector_kind,selector_value,replaces_slot_key,planned_minutes,window_start,window_end
 ) VALUES(
   previous.todo_id,previous.slot_key,previous.batch_id,p_effective_on,previous.ends_on,
   CASE WHEN p_new_mode='fixed' THEN p_start_time END, CASE WHEN p_new_mode='fixed' THEN p_end_time END,
   previous.timezone,p_new_mode,previous.selector_kind,previous.selector_value,previous.replaces_slot_key,
   CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END,
   CASE WHEN p_new_mode='window' THEN p_window_start END, CASE WHEN p_new_mode='window' THEN p_window_end END
 ) RETURNING id INTO new_id;
 RETURN new_id;
END $body$;
REVOKE ALL ON FUNCTION public.revise_execution_template_v3(uuid,date,text,time,time,time,time,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_execution_template_v3(uuid,date,text,time,time,time,time,integer) TO authenticated;

-- Change named slots of one batch from a date (NULL p_slot_keys = every slot of the batch).
CREATE OR REPLACE FUNCTION public.revise_execution_batch_v4(
  p_batch_id uuid, p_slot_keys uuid[], p_effective_on date, p_new_mode text,
  p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL,
  p_window_start time DEFAULT NULL, p_window_end time DEFAULT NULL,
  p_planned_minutes integer DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  v_todo uuid;
  v_slot uuid;
  v_eff date;
  v_end date;
  v_open boolean;
  v_cover public.todo_execution_templates%ROWTYPE;
  v_changed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE = '42501'; END IF;
  IF p_effective_on IS NULL OR p_effective_on < current_date - 1 THEN RAISE EXCEPTION 'Effective date must be today or later'; END IF;
  IF p_new_mode NOT IN ('fixed','window','flexible') THEN RAISE EXCEPTION 'Invalid execution mode'; END IF;
  IF p_new_mode = 'fixed' AND (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time) THEN RAISE EXCEPTION 'Invalid same-day booked time'; END IF;
  IF p_new_mode = 'window' AND (p_window_start IS NULL OR p_window_end IS NULL OR p_window_end <= p_window_start) THEN RAISE EXCEPTION 'Invalid time window'; END IF;
  IF p_new_mode IN ('window','flexible') AND (p_planned_minutes IS NULL OR p_planned_minutes NOT BETWEEN 1 AND 1440) THEN RAISE EXCEPTION 'Invalid effort minutes'; END IF;

  SELECT t.todo_id INTO v_todo FROM public.todo_execution_templates t
    JOIN public.todos o ON o.id = t.todo_id AND o.user_id = auth.uid()
   WHERE t.batch_id = p_batch_id LIMIT 1;
  IF v_todo IS NULL THEN RAISE EXCEPTION 'Series not found' USING ERRCODE = '42501'; END IF;
  IF p_slot_keys IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_slot_keys) k
        WHERE NOT EXISTS (SELECT 1 FROM public.todo_execution_templates t WHERE t.batch_id = p_batch_id AND t.slot_key = k)) THEN
    RAISE EXCEPTION 'Slot does not belong to this series';
  END IF;
  PERFORM 1 FROM public.todo_execution_templates WHERE batch_id = p_batch_id FOR UPDATE;

  FOR v_slot IN SELECT DISTINCT slot_key FROM public.todo_execution_templates
                 WHERE batch_id = p_batch_id AND (p_slot_keys IS NULL OR slot_key = ANY (p_slot_keys)) LOOP
    SELECT GREATEST(p_effective_on, min(starts_on)), bool_or(ends_on IS NULL), max(ends_on)
      INTO v_eff, v_open, v_end
      FROM public.todo_execution_templates WHERE batch_id = p_batch_id AND slot_key = v_slot;
    IF v_open THEN v_end := NULL; END IF;
    IF v_end IS NOT NULL AND v_end < v_eff THEN CONTINUE; END IF;  -- slot already finished

    -- Later versions are replaced by this revision.
    DELETE FROM public.todo_execution_templates WHERE batch_id = p_batch_id AND slot_key = v_slot AND starts_on > v_eff;
    SELECT * INTO v_cover FROM public.todo_execution_templates
     WHERE batch_id = p_batch_id AND slot_key = v_slot AND starts_on <= v_eff ORDER BY starts_on DESC LIMIT 1;

    IF v_cover.starts_on = v_eff THEN
      UPDATE public.todo_execution_templates SET
        execution_mode = p_new_mode, ends_on = v_end,
        start_time = CASE WHEN p_new_mode = 'fixed' THEN p_start_time END, end_time = CASE WHEN p_new_mode = 'fixed' THEN p_end_time END,
        window_start = CASE WHEN p_new_mode = 'window' THEN p_window_start END, window_end = CASE WHEN p_new_mode = 'window' THEN p_window_end END,
        planned_minutes = CASE WHEN p_new_mode = 'fixed' THEN NULL ELSE p_planned_minutes END, updated_at = now()
      WHERE id = v_cover.id;
    ELSE
      UPDATE public.todo_execution_templates SET ends_on = v_eff - 1, updated_at = now() WHERE id = v_cover.id;
      INSERT INTO public.todo_execution_templates(
        todo_id, slot_key, batch_id, starts_on, ends_on, timezone, selector_kind, selector_value, replaces_slot_key,
        execution_mode, start_time, end_time, window_start, window_end, planned_minutes)
      VALUES (v_cover.todo_id, v_slot, p_batch_id, v_eff, v_end, v_cover.timezone, v_cover.selector_kind, v_cover.selector_value, v_cover.replaces_slot_key,
        p_new_mode, CASE WHEN p_new_mode = 'fixed' THEN p_start_time END, CASE WHEN p_new_mode = 'fixed' THEN p_end_time END,
        CASE WHEN p_new_mode = 'window' THEN p_window_start END, CASE WHEN p_new_mode = 'window' THEN p_window_end END,
        CASE WHEN p_new_mode = 'fixed' THEN NULL ELSE p_planned_minutes END);
    END IF;
    v_changed := v_changed + 1;
  END LOOP;
  RETURN v_changed;
END
$fn$;
REVOKE ALL ON FUNCTION public.revise_execution_batch_v4(uuid,uuid[],date,text,time,time,time,time,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_execution_batch_v4(uuid,uuid[],date,text,time,time,time,time,integer) TO authenticated;

-- Stop named slots of one batch from a date (NULL p_slot_keys = every slot).
CREATE OR REPLACE FUNCTION public.stop_execution_batch_v4(p_batch_id uuid, p_slot_keys uuid[], p_effective_on date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  v_owner uuid;
  v_changed integer := 0;
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE = '42501'; END IF;
  IF p_effective_on IS NULL OR p_effective_on < current_date - 1 THEN RAISE EXCEPTION 'Effective date must be today or later'; END IF;
  SELECT o.user_id INTO v_owner FROM public.todo_execution_templates t JOIN public.todos o ON o.id = t.todo_id
   WHERE t.batch_id = p_batch_id AND o.user_id = auth.uid() LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Series not found' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.todo_execution_templates WHERE batch_id = p_batch_id FOR UPDATE;

  DELETE FROM public.todo_execution_templates
   WHERE batch_id = p_batch_id AND (p_slot_keys IS NULL OR slot_key = ANY (p_slot_keys)) AND starts_on >= p_effective_on;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_changed := v_changed + v_n;
  UPDATE public.todo_execution_templates SET ends_on = p_effective_on - 1, updated_at = now()
   WHERE batch_id = p_batch_id AND (p_slot_keys IS NULL OR slot_key = ANY (p_slot_keys))
     AND starts_on < p_effective_on AND (ends_on IS NULL OR ends_on >= p_effective_on);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_changed := v_changed + v_n;
  RETURN v_changed;
END
$fn$;
REVOKE ALL ON FUNCTION public.stop_execution_batch_v4(uuid,uuid[],date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_execution_batch_v4(uuid,uuid[],date) TO authenticated;

COMMIT;

-- 验证 / Post-checks
--   SELECT count(*) FROM public.todo_execution_templates WHERE batch_id IS NULL;   -- expect 0
--   SELECT conname FROM pg_constraint WHERE conname = 'todo_execution_templates_slot_versions_disjoint';

-- ROLLBACK-BEGIN
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.revise_execution_batch_v4(uuid,uuid[],date,text,time,time,time,time,integer);
-- DROP FUNCTION IF EXISTS public.stop_execution_batch_v4(uuid,uuid[],date);
-- ALTER TABLE public.todo_execution_templates DROP CONSTRAINT IF EXISTS todo_execution_templates_slot_versions_disjoint;
-- -- Restore the M7 body of revise_execution_template_v3 (the P4 output) BEFORE dropping the column,
-- -- because the v4_11 body references batch_id. Re-running supabase/task_model_v3_m7_template_revision.sql does exactly that.
-- CREATE OR REPLACE FUNCTION public.revise_execution_template_v3(p_template_id uuid, p_effective_on date, p_new_mode text, p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL, p_window_start time DEFAULT NULL, p_window_end time DEFAULT NULL, p_planned_minutes integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$ DECLARE previous public.todo_execution_templates%ROWTYPE; new_id uuid; BEGIN SELECT * INTO previous FROM public.todo_execution_templates WHERE id=p_template_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF; IF NOT EXISTS (SELECT 1 FROM public.todos WHERE id=previous.todo_id AND user_id=(SELECT auth.uid())) THEN RAISE EXCEPTION 'Not permitted'; END IF; IF p_effective_on<previous.starts_on OR (previous.ends_on IS NOT NULL AND p_effective_on>previous.ends_on) THEN RAISE EXCEPTION 'Date outside template effective range'; END IF; IF p_new_mode NOT IN ('fixed','window','flexible') THEN RAISE EXCEPTION 'Invalid execution mode'; END IF; IF p_new_mode='fixed' AND (p_start_time IS NULL OR p_end_time IS NULL OR p_end_time<=p_start_time) THEN RAISE EXCEPTION 'Invalid same-day booked time'; END IF; IF p_new_mode='window' AND (p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start) THEN RAISE EXCEPTION 'Invalid time window'; END IF; IF p_new_mode IN ('window','flexible') AND (p_planned_minutes IS NULL OR p_planned_minutes NOT BETWEEN 1 AND 1440) THEN RAISE EXCEPTION 'Invalid effort minutes'; END IF; IF p_effective_on=previous.starts_on THEN UPDATE public.todo_execution_templates SET execution_mode=p_new_mode, start_time=CASE WHEN p_new_mode='fixed' THEN p_start_time ELSE NULL END, end_time=CASE WHEN p_new_mode='fixed' THEN p_end_time ELSE NULL END, window_start=CASE WHEN p_new_mode='window' THEN p_window_start ELSE NULL END, window_end=CASE WHEN p_new_mode='window' THEN p_window_end ELSE NULL END, planned_minutes=CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END, updated_at=now() WHERE id=previous.id; RETURN previous.id; END IF; UPDATE public.todo_execution_templates SET ends_on=p_effective_on-1,updated_at=now() WHERE id=previous.id; INSERT INTO public.todo_execution_templates(todo_id,slot_key,starts_on,ends_on,start_time,end_time,timezone,execution_mode,selector_kind,selector_value,replaces_slot_key,planned_minutes,window_start,window_end) VALUES(previous.todo_id,previous.slot_key,p_effective_on,previous.ends_on,CASE WHEN p_new_mode='fixed' THEN p_start_time ELSE NULL END,CASE WHEN p_new_mode='fixed' THEN p_end_time ELSE NULL END,previous.timezone,p_new_mode,previous.selector_kind,previous.selector_value,previous.replaces_slot_key,CASE WHEN p_new_mode='fixed' THEN NULL ELSE p_planned_minutes END,CASE WHEN p_new_mode='window' THEN p_window_start ELSE NULL END,CASE WHEN p_new_mode='window' THEN p_window_end ELSE NULL END) RETURNING id INTO new_id; RETURN new_id; END $body$;
-- DROP INDEX IF EXISTS public.todo_execution_templates_batch_idx;
-- ALTER TABLE public.todo_execution_templates DROP COLUMN IF EXISTS batch_id;
-- COMMIT;
-- ROLLBACK-END
