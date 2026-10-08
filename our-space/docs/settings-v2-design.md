# Our Space — Settings V2 设计与实施方案

状态：**设计已确认，尚未实施功能或数据库迁移**  
日期：2026-10-08  
范围：Web Settings / Focus / Reminder / 后续 Tauri Companion / i18n

## 1. 目标

在现有 `/settings` 页面建立统一的用户偏好中心，避免 Focus、Reminder、语言设置各自维护独立状态。

- 用户在一个页面管理语言、声音总开关、音量、Focus 结束音、Session Reminder 提醒音。
- 用户可以试听已存在的六个 Chime 音效。
- 偏好在 Web 和后续 Tauri 客户端之间同步。
- 各功能组件只消费设置：Settings 管理偏好，FocusTimer 播放 Focus 音，GlobalReminderProvider 播放 Reminder 音。
- 保留现有资料、时区、Space 管理设置，不改变 Todo / Todo Session / Quick Notes 数据模型。
- 语言配置与界面完整翻译分两阶段交付；绝不能仅添加语言下拉框却宣称全站已支持英文。

## 2. 基于当前 main 的代码核对

| 文件 | 当前行为 | V2 调整 |
| --- | --- | --- |
| `app/(app)/settings/page.tsx` | 资料、Space、邀请码、成员、退出登录 | 追加「常规/语言」和「声音」偏好区域 |
| `components/SettingsForm.tsx` | 更新 `profiles.display_name/avatar_url/timezone` | 保留现有职责 |
| `components/SoundSelector.tsx` | Focus 页本地选择 Chime，使用 `focus_sound` / `focus_sound_enabled` | 改成 Settings 内的音效编辑器，或废弃旧组件并用新组件替代 |
| `app/(app)/focus/[todoId]/page.tsx` | `FocusTimer` 下方渲染 `SoundSelector` | 移除完整音效选择 UI；可保留跳到设置的文字链接 |
| `components/FocusTimer.tsx` | 通过 localStorage 读取 Focus 音及开关，播放音量固定 0.5 | 使用统一的偏好读取/订阅接口 |
| `components/GlobalReminderProvider.tsx` | 固定播放 `/sounds/chime-2.mp3`，音量 0.45 | 改为读取 Reminder 音效、开关及音量 |
| `app/(app)/layout.tsx` | 已挂载全局 Reminder Provider | 可以在 App 层提供统一 preferences；保留全局 Reminder |
| `public/sounds/` | 已有 `chime-1.mp3` 至 `chime-6.mp3` | 不重复上传音效文件 |
| `supabase/schema.sql` | 旧基础 schema，未定义 user_preferences | 单独新增幂等 migration，不直接重跑基础 schema |
| `package.json` | Next 15、React 19、无专门 i18n 依赖 | 先建立 typed dictionaries；是否引入 i18n 库等全面语言迁移时再定 |

> 注意：基础 `schema.sql` 不是当前全部 Todo/Session migration 的完整汇总；实施前应以实际 Supabase 表和权限为准。

## 3. Settings 页面信息架构

现有资料与 Space 区块继续保留。推荐顺序：

1. **常规**：语言（简体中文、English；英文仅在翻译覆盖后可正式切换）、未来可扩展外观。
2. **声音与提醒**：总开关、Focus 完成音、Reminder 提醒音、统一音量、逐项试听；系统通知授权状态可作为只读说明/授权入口，但不是 Reminder 时间设置。
3. **我的资料**：现有姓名、头像、时区。
4. **我的 Space / 当前 Space**：沿用现有功能。
5. 退出登录。

建议在移动端保持单列卡片，不引入全屏复杂弹窗。

### 声音 UI

- 「开启声音」主开关。
- 「专注结束音」选择：Chime 1–6，支持试听。
- 「日历提醒音」选择：Chime 1–6，支持试听。
- 「音量」0–100% 滑杆；与两个声音类型共享。
- 若总开关关闭：不自动播放 Focus 和 Reminder 音，但 **Reminder Toast 和系统通知继续正常工作**；试听按钮允许用户主动试听并明确不代表自动播放已开启。
- 不引入 UI 点击声等新类型。
- 默认 Focus `chime-1`；默认 Reminder `chime-2`；建议默认 `sound_enabled=true`、`sound_volume=0.5`。

## 4. 数据模型

建议新建 **`public.user_preferences`**，与 `profiles` 一对一，不把偏好塞进 Todo 或 Session：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `user_id` | uuid PK, FK -> auth.users(id) ON DELETE CASCADE | — | 只属于登录用户 |
| `language` | text | `zh-CN` | V2 目标：`zh-CN`、`en` |
| `sound_enabled` | boolean | true | 全局自动播放开关 |
| `sound_volume` | numeric | 0.5 | 0 到 1 |
| `focus_complete_sound` | text | `chime-1` | Focus 完成音 |
| `reminder_sound` | text | `chime-2` | Reminder 提醒音 |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | now() | |

SQL migration 应：
- `CREATE TABLE IF NOT EXISTS`，检查合法语言、合法 Chime ID、音量范围。
- 开启 RLS；`SELECT/INSERT/UPDATE` policy 要求 `auth.uid() = user_id`；不允许用户读取/修改其他人的偏好。
- 使用 `INSERT ... ON CONFLICT (user_id) DO UPDATE` 或按需创建默认行，并处理并发首次写入。
- 触发器维护 `updated_at`（可复用现有 `touch_updated_at()`）。
- 不引入 service-role 密钥到客户端。
- 迁移与应用代码分开提交/部署，避免字段未创建时所有页面报错。

**首选数据库持久化**，不是仅 localStorage：同一帐号的 Web 与 Tauri 未来共享设置。可在本机缓存偏好供首屏快速展示，但数据库为真值，缓存要按用户隔离并更新。

## 5. 兼容现有 localStorage

现有 Focus 键：
- `focus_sound`，默认 `chime-1`
- `focus_sound_enabled`，默认 true

首次初始化原则：
1. 如果已有 `user_preferences` 行，数据库设置优先。
2. 如无数据库行且客户端存在合法旧 Focus 键，可将对应值迁入新行，保留默认 Reminder 音效。
3. 迁移只做一次，幂等；**不允许**旧浏览器的本地值覆盖用户已在其他设备保存的数据库设置。
4. 新组件统一通过 `getPreferences/savePreferences`（或 Context hook）读取和写入；保持旧 key 兼容层仅作为过渡，最后删除。
5. 用户登出/切换帐号时，停止使用上一帐号的内存缓存；必要时通过 userId 命名空间隔离 localStorage。

## 6. 运行时职责

```text
Settings Preferences UI
        |
        v
shared preferences types + service
        |
        v
Supabase user_preferences (authoritative)
       / \
      v   v
 Web consumers    Tauri consumers (later)
 |        |
 FocusTimer        Focus Companion native player
 GlobalReminderProvider   Native reminders (future)
```

- **FocusTimer**：读取 `sound_enabled`、`focus_complete_sound`、`sound_volume`，结束时播放一次；原计时状态逻辑不变。
- **GlobalReminderProvider**：仍由现有 `todo_sessions.reminder_minutes_before` 驱动到期检查，读取 `reminder_sound` 和音量；静音不等于关闭视觉提醒。
- **Calendar**：继续负责设置 *某个 Session 提前多久提醒*，**不负责**提醒声音或执行通知。
- **Settings**：更新设置、试听声音、提示浏览器权限；**不执行**定时提醒。
- **Tauri**：共享 schema/types/service 契约，但单独实现 Native Notification / Sound UI，不能简单复用 Web 组件。

### 多标签同步

保存成功后更新当前 Context，并用 `BroadcastChannel` 或 `storage` 事件让其他标签页刷新缓存。其他设备以数据库同步为准；V2 可以在页面重新聚焦时重读，不要求 Realtime 订阅。

## 7. 语言（i18n）阶段划分

### Phase A：语言偏好数据与基础设施

- 字段 `language`，默认 `zh-CN`。
- 定义 `Locale = "zh-CN" | "en"`、typed 翻译字典与 `t(key)`。
- 界面改为从字典读取，而不是根据页面写死中/英文。
- 先支持 Settings 的语言项，避免在英文翻译未覆盖前开放一个不完整的全站切换体验。
- 日期/数字显示遵从语言，但用户 `profile.timezone` 继续决定日历日期边界，不能把 locale 当 timezone。

### Phase B：全站逐页面覆盖

建议顺序：Nav/Settings -> Today/Todo -> Calendar -> Focus/Reminder -> Friends/History/Space/Journal（如果已实现）。
包含动态错误文案、按钮 aria-label、placeholder、空状态、Notification 标题和 Toast 文案。语言切换后不要求重新登录、不丢失计时器进度或任务输入。中文默认。

若采用 Next.js locale 路由或专门库，应先核对现有 Next 15 App Router 结构和现有 auth/redirect，避免贸然引入 `/[locale]` 大规模路由迁移。

## 8. Reminder 限制及后续改进

提醒声音已有 V1 实现（固定 chime-2）；V2 改偏好来源，不变更 Session 的提醒时间计算。

需要持续记录的 Reminder 技术债：
- 网页关闭时普通页面级定时器不能保证触发，需要后续 Push/Service Worker 或 Tauri native 后台执行。
- 浏览器可能阻止非用户手势启动的声音，声音播放失败不应阻断 Toast。
- 目前同一时刻多个提醒的队列与 dedupe 需要专门测试，尤其跨标签页。
- 系统通知权限必须由用户手势触发请求，并允许用户拒绝；拒绝不影响站内 Toast。
- 允许将来独立设置每种声音的开关，但 V2 先保持一个全局总开关。

## 9. 实施步骤和验收标准

### PR/Commit 1 — Schema & types
- 新建单独 `user_preferences` migration，启用 RLS、约束。
- typed preferences service、默认值、输入校验，安全 fallback。
- **验收**：新用户默认值正确；不同用户数据隔离；同一用户多设备读取一致。

### PR/Commit 2 — Settings 声音 UI
- 在现有 Settings 页面追加偏好卡片。
- 六个音效可分别试听；选择 Focus/Reminder 音、总开关和音量后保存。
- **验收**：刷新与重新登录后偏好仍在；关声音仍能看到 Reminder Toast。

### PR/Commit 3 — 运行时接入
- FocusTimer 和 GlobalReminderProvider 改读统一 service/context。
- Focus 页移除重复的 SoundSelector 大卡片，可换「调整提示音」链接。
- 旧 Focus localStorage 仅做一次兼容迁移。
- **验收**：选不同音后 Focus/Reminder 分别播放正确；Reminder Session 拖动后仍按新时间触发；不产生重复声音。

### PR/Commit 4 — i18n 基础与逐页翻译
- typed 字典、语言 preference、主要页面文案。
- **验收**：简体中文和 English 关键流程无混合文案；日期、错误消息、Toast 都按选中语言变化。

### PR/Commit 5 — Tauri
- Tauri 按统一偏好读取；独立 native 通知/音效实现。
- **验收**：Web 改声音后 Tauri 能正确读取；不强行复用 Web UI。

## 10. 非目标

- 本设计文档提交不代表已经部署 SQL 或实现 Settings V2。
- 不在这一轮重构 Todo/Quick Notes/Calendar 数据模型。
- 不在这一轮实现网页关闭后的后台提醒。
- 不在这一轮开发全站主题/自定义上传音效/复杂音频混音。
- 不把语言切换当成时区切换。

## 11. 下一步建议

先提交 **Schema & types** 作为独立改动，再做 Settings 声音 UI。这样可以先验证 RLS、跨设备同步和旧 Focus 偏好迁移，而不是在同一个 commit 混合数据库、声音播放器和全站翻译。
