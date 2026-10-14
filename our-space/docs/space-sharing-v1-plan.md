# Space 任务分享 V1 — 目标与修改方案（问题 15）

状态：方案已确认，A1 已在 `fix/own-tasks-all-spaces` 分支完成，其余待实施。

## 1. 目标

用户创建任务时可以选择「仅自己可见」，或分享到一个或多个 Space。分享后，该 Space 的所有成员都能在 Space 页面看到这个任务。

已确认的规则：

| 规则 | 决定 |
|---|---|
| 分享范围 | 多选 Space；选中的 Space 全部成员可见 |
| 改回私密 | 立即从所有朋友的页面消失；已有互动保留但隐藏，再次分享时恢复 |
| 第一层（分享即公开） | 标题、类型、日期或周期规则 |
| 第二层：描述 | 默认可见，以一行轻提示告知，可选择隐藏 |
| 第二层：完成情况与专注时长 | 默认不分享，用户主动勾选 |
| 两个开关的作用范围 | 对所有已选 Space 统一生效，不按 Space 分别设置 |
| Routine | 朋友看到 Routine 本身；若开启第二层，再看到完成情况 |
| 退出或被移出 Space | 自动取消该用户在这个 Space 的所有分享 |
| Space 页面 | 按 Space 组织，最多 10 人，可按成员筛选 |
| 自己的视图 | 显示自己的全部任务，不受「当前 Space」影响 |
| 分组（以后） | 只作为快捷选择，保存时展开成具体 Space，任务不绑定分组 |

## 2. 现状审查结论

1. **自己的任务被「当前 Space」过滤（已修复，A1）。** Today、Todo、Calendar、History 都使用 `group_id is null or group_id = 当前 Space`。切换 Space 后，分享到其他 Space 的任务会从自己的页面消失。这也可能是问题 11「Today 没显示全部任务」的成因之一。
2. **朋友目前完全读不到任务。** `todos` 表的 RLS 不在仓库中（应是当时在控制台创建），测试 mock 中是 owner-only。Space 页面（`friends/page.tsx`）只读取 `daily_entries`。所以选择「发布到 Space」目前只是写入了 `todos.group_id`，没有任何读取路径。
3. **分享只能单选。** `todos.group_id` 是一个字段；`AddTodoForm` 只提供「仅自己 / 当前 Space」两个选项；编辑任务时没有修改可见范围的入口（`TodoList` 直接保留原值）。
4. **`save_task_v4` 没有校验 Space 成员身份。** 它直接写入 payload 中的 `group_id`。目前朋友读不到所以没有影响，但开放读取之前必须修复。
5. **日记是「每人每天一条」。** `daily_entries` 有 `unique (user_id, entry_date)`，所以一篇日记只能属于一个 Space。日记多 Space 分享是另一个决定，不在 V1 范围内。
6. **互动只挂在日记上。** `reactions`、`comments` 只引用 `entry_id`。任务鼓励反馈（问题 03）需要新结构，放在以后。
7. 可复用：`is_group_member()`、`shares_group()` 安全函数，`join_group` 已限制 10 人，成员退出走 `members_leave` 删除策略（可挂触发器）。

## 3. 关键技术决定

**`todos` 表保持 owner-only，不给成员开放 SELECT。** 朋友端只能通过一个 `security definer` 函数读取，由函数决定返回哪些字段。原因是 RLS 只能控制行，不能控制列；如果直接开放 `todos` 的读取，「隐藏描述」和「隐藏专注数据」在数据库层面就无法保证。

## 4. 修改清单（按优先级，标注难度）

难度：轻 = 半天内、单文件或单个 SQL；中 = 1–2 天、涉及前后端；重 = 需要先确认设计。

### P0 — 正确性与安全（先做）

| 编号 | 内容 | 难度 | 状态 |
|---|---|---|---|
| A1 | 自己的 Today / Todo / Calendar / History 不再按当前 Space 过滤 | 轻 | ✅ 已完成（分支 `fix/own-tasks-all-spaces`） |
| A2 | 在 Supabase 运行只读查询，确认生产环境 `todos`、`todo_sessions`、`focus_entries` 的实际 RLS：`select tablename, policyname, cmd, qual from pg_policies where schemaname='public' and tablename in ('todos','todo_sessions','focus_entries');` | 轻 | 待做 |
| A3 | `save_task_v4` 写入 Space 前校验 `is_group_member()`，不是成员则报错 | 轻 | 待做（与 B5 合并发布） |

### P1 — 数据层（一次迁移完成）

| 编号 | 内容 | 难度 |
|---|---|---|
| B1 | 新表 `todo_space_shares (todo_id, group_id, created_at, primary key (todo_id, group_id))`，RLS：只有任务所有者可写，所有者可读。把现有 `todos.group_id` 非空的数据迁移过来；`group_id` 字段暂时保留不删，迁移完成后停止写入 | 中 |
| B2 | `todos` 增加 `share_description boolean not null default true`、`share_progress boolean not null default false` | 轻 |
| B3 | `group_members` 删除后触发器：删除该用户在该 Space 的 `todo_space_shares` 行 | 轻 |
| B4 | 朋友端读取函数 `get_space_shared_tasks(p_group_id uuid, p_date date)`，`security definer`：先校验 `is_group_member(p_group_id)`；只返回分享到该 Space 的任务；返回标题、类型、日期、周期规则、作者；`share_description=false` 时描述返回 null；`share_progress=true` 时才返回当天完成状态和专注分钟数。权限 `revoke from public, anon; grant to authenticated` | 中 |
| B5 | `save_task_v4` 接受 `space_ids uuid[]`、`share_description`、`share_progress`，在同一事务中重写 `todo_space_shares`；包含 A3 的成员校验 | 中 |

### P1 — 界面

| 编号 | 内容 | 难度 |
|---|---|---|
| C1 | `AddTodoForm` 可见范围改为多选：页面需要传入用户所有 Space 列表（目前只传当前 Space）。选中任意 Space 后才出现两行：「描述对空间成员可见 · 隐藏」和「☐ 分享完成情况与专注时长」 | 中 |
| C2 | 编辑任务时可以修改可见范围和两个开关（复用 C1 组件），去掉 `TodoList` 中直接保留 `group_id` 的逻辑 | 中 |
| C3 | Space 页面 v1：在现有日记 feed 上方加入「今天」区块，调用 B4；顶部成员头像横排，点击筛选；每人默认最多显示 5 条，可展开 | 中 |
| C4 | 任务卡片上显示小标记「已分享到 X 个空间」，自己能一眼看出哪些任务是公开的 | 轻 |

### P2 — 完善

| 编号 | 内容 | 难度 |
|---|---|---|
| D1 | Space 页面加入成长动态（Growth Journey 里程碑） | 中 |
| D2 | 日记是否支持多 Space 分享（需改 `daily_entries` 唯一约束，先讨论） | 重 |

### P3 — 以后

| 编号 | 内容 | 难度 |
|---|---|---|
| E1 | Space 分组快捷选择（新表 `space_groups`，保存时展开） | 中 |
| E2 | 完成后分享按钮：生成一条引用 `todo_id` 的 Space 动态，继承任务可见范围 | 中 |
| E3 | 任务鼓励反馈（问题 03），与 E2 共用互动结构 | 中 |
| E4 | 图片发布（问题 05） | 中 |

## 5. 推荐执行顺序

1. 合并 A1，跑一次 A2 只读查询。
2. 一个迁移文件完成 B1–B5 + A3（`supabase/space_sharing_v1.sql`），附带测试 `supabase/tests/14_space_sharing_test.sql`。
3. C1 + C2（创建和编辑同一个组件）。
4. C3 + C4。
5. 之后再评估 D 和 E。

B 系列需要在 Sprint 1 的 Today 归属规则（问题 11）确定后再做 C3，因为 Space 页面「今天」的判断要和自己的 Today 保持一致。

## 6. 验收用例

1. 任务分享到 A、B 两个 Space：A、B 成员都能看到；C Space 成员看不到。
2. 改为仅自己：A、B 成员刷新后看不到；再次分享到 A，原有互动恢复。
3. 关闭描述：朋友端返回的描述为空，直接调用 Supabase 接口也拿不到。
4. 未开启完成情况：朋友看不到完成状态和专注分钟。
5. 用户退出 A：他分享到 A 的任务全部从 A 消失，B 不受影响。
6. 非成员调用 `get_space_shared_tasks` 得到错误或空结果。
7. 用 `save_task_v4` 写入自己不在的 Space：被拒绝。
8. 切换当前 Space：自己的 Today、Todo、Calendar、History 内容不变。
