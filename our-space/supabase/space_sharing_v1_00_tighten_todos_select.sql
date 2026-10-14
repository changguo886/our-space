-- Space sharing V1 · step 00: todos 只允许所有者读取
--
-- 背景：生产环境 todos_select 允许 Space 成员读取 group_id 指向该 Space 的整行，
-- 包括 description 等全部字段。应用里没有任何地方依赖这条规则（所有 todos 查询
-- 都按 user_id = 自己 或按自己的任务 id 读取），但任何成员都可以直接通过
-- Supabase 接口读到朋友任务的完整内容。
--
-- 朋友端以后统一通过 get_space_shared_tasks()（security definer）读取，
-- 由函数决定返回哪些字段，所以这里先收紧为 owner-only。
--
-- 可重复执行；只改 SELECT 策略，不改数据。

begin;

drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos
  for select to authenticated
  using (user_id = auth.uid());

commit;

-- 验证（应只返回一行，qual = (user_id = auth.uid())）：
-- select policyname, cmd, qual from pg_policies
-- where schemaname = 'public' and tablename = 'todos' and cmd = 'SELECT';
