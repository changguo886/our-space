-- =============================================================
-- Space sharing V1 · step 01（问题 15）
--
-- 前置：space_sharing_v1_00_tighten_todos_select.sql 已运行（todos 只允许所有者读取）。
--
-- 内容：
--   B1  todo_space_shares：一个任务可以分享到多个 Space；从 todos.group_id 回填
--   B2  todos.share_description（默认 true）、todos.share_progress（默认 false）
--   B3  成员退出或被移出 Space 时，自动删除他在该 Space 的分享
--   B4  get_space_shared_tasks()：朋友端唯一的读取入口，按开关决定返回哪些字段
--   B5  set_task_sharing()：一次性设置分享范围和两个开关（校验 Space 成员身份）
--
-- 不改动 save_task_v4。todos.group_id 保留不删，但朋友端不再读取它；
-- 界面切换到 set_task_sharing 之后，它只作为历史字段存在。
--
-- 可重复执行。回滚见文件末尾 ROLLBACK 段。
-- =============================================================

begin;

-- ---------- B1 ----------
create table if not exists public.todo_space_shares (
  todo_id    uuid not null references public.todos(id)  on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (todo_id, group_id)
);
create index if not exists todo_space_shares_group_idx
  on public.todo_space_shares (group_id);

alter table public.todo_space_shares enable row level security;

drop policy if exists todo_space_shares_select on public.todo_space_shares;
create policy todo_space_shares_select on public.todo_space_shares
  for select to authenticated
  using (exists (select 1 from public.todos t
                 where t.id = todo_id and t.user_id = auth.uid()));

drop policy if exists todo_space_shares_insert on public.todo_space_shares;
create policy todo_space_shares_insert on public.todo_space_shares
  for insert to authenticated
  with check (
    exists (select 1 from public.todos t
            where t.id = todo_id and t.user_id = auth.uid())
    and public.is_group_member(group_id)
  );

drop policy if exists todo_space_shares_delete on public.todo_space_shares;
create policy todo_space_shares_delete on public.todo_space_shares
  for delete to authenticated
  using (exists (select 1 from public.todos t
                 where t.id = todo_id and t.user_id = auth.uid()));

revoke all on public.todo_space_shares from anon;
grant select, insert, delete on public.todo_space_shares to authenticated;

-- 回填：只迁移所有者仍是该 Space 成员的分享
insert into public.todo_space_shares (todo_id, group_id)
select t.id, t.group_id
from public.todos t
join public.group_members m on m.group_id = t.group_id and m.user_id = t.user_id
where t.group_id is not null
on conflict do nothing;

-- ---------- B2 ----------
alter table public.todos
  add column if not exists share_description boolean not null default true,
  add column if not exists share_progress    boolean not null default false;

-- ---------- B3 ----------
create or replace function public.unshare_on_member_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.todo_space_shares s
  using public.todos t
  where s.todo_id = t.id
    and s.group_id = old.group_id
    and t.user_id = old.user_id;
  return old;
end $$;
revoke all on function public.unshare_on_member_leave() from public, anon, authenticated;

drop trigger if exists group_members_unshare on public.group_members;
create trigger group_members_unshare
  after delete on public.group_members
  for each row execute function public.unshare_on_member_leave();

-- ---------- B5 ----------
-- p_group_ids 为空数组 = 仅自己可见。整组替换，不做增量。
create or replace function public.set_task_sharing(
  p_todo_id           uuid,
  p_group_ids         uuid[],
  p_share_description boolean default true,
  p_share_progress    boolean default false
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_ids uuid[] := coalesce(p_group_ids, '{}'::uuid[]);
  v_bad uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.todos
                 where id = p_todo_id and user_id = auth.uid()) then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  select g into v_bad from unnest(v_ids) g
  where not public.is_group_member(g) limit 1;
  if v_bad is not null then
    raise exception 'not a member of space %', v_bad using errcode = '42501';
  end if;

  delete from public.todo_space_shares
  where todo_id = p_todo_id and not (group_id = any (v_ids));

  insert into public.todo_space_shares (todo_id, group_id)
  select p_todo_id, g from (select distinct unnest(v_ids) g) x
  on conflict do nothing;

  update public.todos
  set share_description = coalesce(p_share_description, true),
      share_progress    = coalesce(p_share_progress, false)
  where id = p_todo_id;
end $$;
revoke all on function public.set_task_sharing(uuid, uuid[], boolean, boolean) from public, anon;
grant execute on function public.set_task_sharing(uuid, uuid[], boolean, boolean) to authenticated;

-- ---------- B4 ----------
-- 返回分享到 p_group_id、且与 p_date 相关的任务：
--   one_time：task_date = p_date
--   project ：p_date 在 plan_start_date（缺省 task_date）与
--             coalesce(target_finish_date, deadline_date) 之间（结束日期为空则不设上限）
--   routine ：habit_patterns_v3 在 p_date 有效（starts_on/ends_on）
-- 「今天」的规则以后要与问题 11 的 Today 归属规则保持一致。
--
-- 字段控制：
--   description          仅在 share_description = true 时返回
--   completed / today_count / focus_minutes
--                        仅在 share_progress = true 时返回，否则为 null
create or replace function public.get_space_shared_tasks(p_group_id uuid, p_date date)
returns table (
  todo_id            uuid,
  owner_id           uuid,
  title              text,
  task_type          text,
  task_date          date,
  plan_start_date    date,
  target_finish_date date,
  color_hex          text,
  description        text,
  routine_period     text,
  routine_target     integer,
  routine_weekdays   smallint[],
  share_progress     boolean,
  completed          boolean,
  today_count        integer,
  focus_minutes      integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'not a member of this space' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.user_id,
    t.title,
    t.task_type,
    t.task_date,
    t.plan_start_date,
    t.target_finish_date,
    t.color_hex,
    case when t.share_description then t.description end,
    hp.period,
    hp.target_count,
    hp.weekdays,
    t.share_progress,
    case when not t.share_progress then null
         when t.task_type = 'routine' then coalesce(hl.n, 0) > 0
         else t.status = 'completed' end,
    case when t.share_progress and t.task_type = 'routine' then coalesce(hl.n, 0)::integer end,
    case when t.share_progress then coalesce(fe.minutes, 0)::integer end
  from public.todo_space_shares s
  join public.todos t on t.id = s.todo_id
  -- 作者仍是成员才显示（退出时触发器已删除分享，这里再兜底一次）
  join public.group_members gm on gm.group_id = s.group_id and gm.user_id = t.user_id
  left join public.profiles p on p.id = t.user_id
  left join public.habit_patterns_v3 hp on hp.todo_id = t.id
  left join lateral (
    select count(*) n from public.habit_logs l
    where l.todo_id = t.id and l.occurred_on = p_date
  ) hl on t.task_type = 'routine'
  left join lateral (
    select round(sum(f.duration_seconds) / 60.0) minutes from public.focus_entries f
    where f.todo_id = t.id
      and (f.started_at at time zone coalesce(p.timezone, 'UTC'))::date = p_date
  ) fe on true
  where s.group_id = p_group_id
    and (
      (t.task_type = 'one_time' and t.task_date = p_date)
      or (t.task_type = 'project'
          and coalesce(t.plan_start_date, t.task_date) <= p_date
          and (coalesce(t.target_finish_date, t.deadline_date) is null
               or coalesce(t.target_finish_date, t.deadline_date) >= p_date))
      or (t.task_type = 'routine'
          and hp.todo_id is not null
          and (hp.starts_on is null or hp.starts_on <= p_date)
          and (hp.ends_on   is null or hp.ends_on   >= p_date))
    )
  order by t.user_id, t.task_type, t.created_at;
end $$;
revoke all on function public.get_space_shared_tasks(uuid, date) from public, anon;
grant execute on function public.get_space_shared_tasks(uuid, date) to authenticated;

commit;

-- 验证：
-- select count(*) from public.todo_space_shares;
-- select count(*) from public.todos where group_id is not null;   -- 应 ≥ 上一行（差值 = 作者已不在该 Space）
-- select * from public.get_space_shared_tasks('<你的 Space id>', current_date);

-- ROLLBACK-BEGIN
-- begin;
-- drop function if exists public.get_space_shared_tasks(uuid, date);
-- drop function if exists public.set_task_sharing(uuid, uuid[], boolean, boolean);
-- drop trigger if exists group_members_unshare on public.group_members;
-- drop function if exists public.unshare_on_member_leave();
-- alter table public.todos drop column if exists share_description, drop column if exists share_progress;
-- drop table if exists public.todo_space_shares;
-- commit;
-- ROLLBACK-END
