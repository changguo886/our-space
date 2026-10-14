-- Our Space V3 / M3 PROPOSAL: daily multiple and monthly habit targets.
-- NOT DEPLOYED. Review actual Production schedule_rules constraints and readers
-- before applying. This additive design preserves the legacy schedule_rules RPC.
-- Existing weekly habits remain in schedule_rules until an explicit migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.habit_patterns_v3 (
  todo_id uuid PRIMARY KEY REFERENCES public.todos(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('day','week','month')),
  arrangement text NOT NULL CHECK (arrangement IN ('flexible','fixed')),
  target_count integer NOT NULL CHECK (target_count BETWEEN 1 AND 10000),
  weekdays smallint[] NOT NULL DEFAULT '{}'::smallint[],
  month_days smallint[] NOT NULL DEFAULT '{}'::smallint[],
  include_month_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habit_patterns_v3_consistent CHECK (
    (period='day' AND arrangement='flexible' AND cardinality(weekdays)=0 AND cardinality(month_days)=0 AND NOT include_month_end)
    OR (period='week' AND (
      (arrangement='flexible' AND cardinality(weekdays)=0 AND cardinality(month_days)=0 AND NOT include_month_end)
      OR (arrangement='fixed' AND cardinality(weekdays)>0 AND cardinality(month_days)=0 AND NOT include_month_end AND target_count=cardinality(weekdays))
    ))
    OR (period='month' AND (
      (arrangement='flexible' AND cardinality(weekdays)=0 AND cardinality(month_days)=0 AND NOT include_month_end)
      OR (arrangement='fixed' AND cardinality(weekdays)=0 AND (cardinality(month_days)>0 OR include_month_end))
    ))
  )
);
-- The weekday/month-day bounds and uniqueness checks are implemented in the
-- validator function rather than CHECK subqueries (PostgreSQL disallows them).
CREATE OR REPLACE FUNCTION public.validate_habit_pattern_v3()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE n smallint;
BEGIN
  IF NEW.period='week' AND NEW.arrangement='fixed' THEN
    FOREACH n IN ARRAY NEW.weekdays LOOP
      IF n IS NULL OR n<1 OR n>7 THEN RAISE EXCEPTION 'weekday out of range'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT x) FROM unnest(NEW.weekdays) x)<>cardinality(NEW.weekdays)
      THEN RAISE EXCEPTION 'duplicate weekdays'; END IF;
  END IF;
  IF NEW.period='month' AND NEW.arrangement='fixed' THEN
    FOREACH n IN ARRAY NEW.month_days LOOP
      IF n IS NULL OR n<1 OR n>31 THEN RAISE EXCEPTION 'month day out of range'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT x) FROM unnest(NEW.month_days) x)<>cardinality(NEW.month_days)
      THEN RAISE EXCEPTION 'duplicate month days'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS habit_patterns_v3_validate ON public.habit_patterns_v3;
CREATE TRIGGER habit_patterns_v3_validate BEFORE INSERT OR UPDATE ON public.habit_patterns_v3
FOR EACH ROW EXECUTE FUNCTION public.validate_habit_pattern_v3();
ALTER TABLE public.habit_patterns_v3 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit patterns own select" ON public.habit_patterns_v3 FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()) AND t.task_type='habit'));
CREATE POLICY "habit patterns own insert" ON public.habit_patterns_v3 FOR INSERT TO authenticated WITH CHECK
(EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()) AND t.task_type='habit'));
CREATE POLICY "habit patterns own update" ON public.habit_patterns_v3 FOR UPDATE TO authenticated USING
(EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()) AND t.task_type='habit'))
WITH CHECK (EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()) AND t.task_type='habit'));
CREATE POLICY "habit patterns own delete" ON public.habit_patterns_v3 FOR DELETE TO authenticated USING
(EXISTS (SELECT 1 FROM public.todos t WHERE t.id=todo_id AND t.user_id=(SELECT auth.uid()) AND t.task_type='habit'));
COMMIT;
-- Semantics: daily target_count supports >1; monthly flexible target_count is N
-- completed logs per month; monthly fixed month_days 1..31 are selected dates.
-- Missing dates are skipped, never shifted. include_month_end adds actual last
-- date of each month, deduplicated at runtime if also selected explicitly.
-- Do NOT book Calendar sessions merely from this rule.
-- NOTE: month fixed target_count is month-dependent, so the UI must derive
-- actual expected count from selected dates in that specific month, not use
-- stored target_count as the displayed dynamic count.
