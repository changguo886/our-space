-- Minimal stand-in for the Space tables from schema.sql, plus step 00, for the space sharing tests.
-- Run by supabase/tests/run.sh as the superuser BEFORE space_sharing_v1_01.sql. Never run on Supabase.
\set ON_ERROR_STOP on
INSERT INTO auth.users VALUES ('cccccccc-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(id, timezone) VALUES ('cccccccc-0000-0000-0000-000000000003', 'UTC') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (group_id, user_id)
);
CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = gid AND user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS members_select ON public.group_members;
CREATE POLICY members_select ON public.group_members FOR SELECT TO authenticated USING (public.is_group_member(group_id));
DROP POLICY IF EXISTS members_leave ON public.group_members;
CREATE POLICY members_leave ON public.group_members FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups, public.group_members TO authenticated;

-- Space A: users a, b. Space B: users a, c. Space C: user c only.
INSERT INTO public.groups(id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'A'),
  ('b0000000-0000-0000-0000-00000000000b', 'B'),
  ('c0000000-0000-0000-0000-00000000000c', 'C') ON CONFLICT DO NOTHING;
INSERT INTO public.group_members(group_id, user_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING;

-- A legacy shared task (todos.group_id) that the migration must backfill.
INSERT INTO public.todos(id, user_id, group_id, title, task_date, task_type)
VALUES ('5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000000a', 'Legacy shared', current_date, 'one_time')
ON CONFLICT DO NOTHING;

\i space_sharing_v1_00_tighten_todos_select.sql
