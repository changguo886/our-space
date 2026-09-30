-- =============================================================
-- Our Space · 数据库结构 + 行级安全 (RLS)
-- 在 Supabase 控制台 → SQL Editor 中整段运行一次即可。
-- =============================================================

-- ---------- 表 ----------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  timezone     text,
  created_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.daily_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  entry_date    date not null,
  today_tasks   text check (char_length(today_tasks) <= 4000),
  today_note    text check (char_length(today_note) <= 4000),
  tomorrow_plan text check (char_length(tomorrow_plan) <= 4000),
  mood          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, entry_date)            -- 每人每天最多一条
);
create index if not exists daily_entries_group_date_idx
  on public.daily_entries (group_id, entry_date desc);

create table if not exists public.reactions (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.daily_entries(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('hug', 'cheer', 'seen')),
  created_at    timestamptz not null default now(),
  unique (entry_id, user_id)              -- 每人对一条记录只选一个
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.daily_entries(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_entry_idx on public.comments (entry_id, created_at);

-- ---------- 触发器 ----------

-- 新用户注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 自动更新 updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists daily_entries_touch on public.daily_entries;
create trigger daily_entries_touch
  before update on public.daily_entries
  for each row execute function public.touch_updated_at();

-- ---------- 权限辅助函数（security definer，避免 RLS 递归）----------

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.can_see_entry(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.daily_entries e
    where e.id = eid
      and (e.user_id = auth.uid() or public.is_group_member(e.group_id))
  );
$$;

-- ---------- 创建 / 加入小组（只能通过这两个函数写入 groups 和 group_members）----------

create or replace function public.create_group(group_name text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'group name required'; end if;
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, created_by)
  values (trim(group_name), code, auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if not found then raise exception 'invalid invite code'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then
    return g;
  end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 10 then
    raise exception 'group is full';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

revoke all on function public.create_group(text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.shares_group(uuid) from public, anon;
revoke all on function public.can_see_entry(uuid) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.shares_group(uuid) to authenticated;
grant execute on function public.can_see_entry(uuid) to authenticated;

-- 未登录用户（anon）对任何表都没有权限
revoke all on all tables in schema public from anon;

-- ---------- 行级安全 RLS ----------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.daily_entries enable row level security;
alter table public.reactions     enable row level security;
alter table public.comments      enable row level security;

-- profiles：自己 + 同组成员可读；只能改自己的
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups：只有成员可读（写入只能走 create_group / join_group）
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));

-- group_members：同组可读；可以自己退出
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists members_leave on public.group_members;
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid());

-- daily_entries：同组可读（自己的永远可读）；只能写/改/删自己的
drop policy if exists entries_select on public.daily_entries;
create policy entries_select on public.daily_entries for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists entries_insert on public.daily_entries;
create policy entries_insert on public.daily_entries for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
drop policy if exists entries_update on public.daily_entries;
create policy entries_update on public.daily_entries for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_group_member(group_id));
drop policy if exists entries_delete on public.daily_entries;
create policy entries_delete on public.daily_entries for delete to authenticated
  using (user_id = auth.uid());

-- reactions：能看到记录的人可读、可加；只能改/删自己的
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_see_entry(entry_id));
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_entry(entry_id));
drop policy if exists reactions_update on public.reactions;
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see_entry(entry_id));
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- comments：能看到记录的人可读、可留言；只能删自己的
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (public.can_see_entry(entry_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_entry(entry_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = auth.uid());
