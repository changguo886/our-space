# Our Space 🌿

一个只属于我们的日常记录小空间。
Next.js 15 + Tailwind CSS + Supabase（数据库 / 登录 / 权限），部署在 Vercel。

---

## 上线步骤

### 1. 创建 Supabase 项目
1. 打开 <https://supabase.com> 注册 → **New project**（Region 选离你们都比较近的，比如 `US East` 或 `Singapore`）。
2. 项目建好后，左侧 **SQL Editor** → New query → 把 `supabase/schema.sql` 整个粘贴进去 → **Run**。
   这一步会建好所有表，并打开行级安全（RLS），保证只有小组成员能看到内容。
3. 左侧 **Project Settings → API**，记下：
   - `Project URL`
   - `anon public` key

### 2. 设置登录邮件（重要：让手机也能顺利登录）
左侧 **Authentication**：

- **URL Configuration**
  - Site URL：先填 `http://localhost:3000`，部署后改成你的网址，比如 `https://our-space.vercel.app`
  - Redirect URLs：加上 `http://localhost:3000/**` 和 `https://our-space.vercel.app/**`
- **Emails → Templates → Magic Link**，把内容换成：

  ```html
  <h2>登录 Our Space</h2>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">点这里登录</a></p>
  <p>或者在网页上输入验证码：<strong>{{ .Token }}</strong></p>
  ```

  这样即使在手机邮件 App 里点开链接（和发邮件时不是同一个浏览器），也能登录；实在不行还可以手动输入 6 位验证码。

  > 「Confirm signup」模板也建议改成同样的内容（第一次登录的人收到的是这一封）。

### 3. 本地试跑（可选）
```bash
cp .env.local.example .env.local   # 填入上面的 URL 和 anon key
npm install
npm run dev                        # 打开 http://localhost:3000
```

### 4. 部署到 Vercel
1. 把这个文件夹推到一个 **GitHub 私有仓库**。
2. 打开 <https://vercel.com> → **Add New Project** → 选这个仓库。
3. **Environment Variables** 里添加：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**。项目名填 `our-space` 就会得到 `our-space.vercel.app`（被占用的话换一个）。
5. 回到 Supabase 第 2 步，把 Site URL 改成这个正式网址。

### 5. 开始使用
1. 你先登录 → 取名字 → **创建新小组** → 在「设置」里复制邀请码。
2. 把网址和邀请码发给朋友 → TA 登录后选 **用邀请码加入**。
3. 手机上可以用浏览器「添加到主屏幕」，像 App 一样打开。

---

## 功能
| 页面 | 内容 |
|---|---|
| `/` | 邮箱登录（链接或 6 位验证码，不需要密码） |
| `/today` | 三个问题，随时修改，空着也可以保存 |
| `/friends` | 小组成员的记录，❤️抱抱 / 🌱加油 / 👀看到了，留言数 |
| `/entry/[id]` | 完整记录 + 回应 + 留言（可以删除自己的留言） |
| `/history` | 自己的日历视图 + 按月时间线 |
| `/settings` | 名字、头像、时区、邀请码、成员列表、退出 |

## 隐私是怎么保证的
- 所有权限都在数据库层面（Supabase RLS）强制执行，不依赖前端：
  不在同一个小组的人，就算拿到了记录的链接，也查不到任何内容。
- 未登录不能访问任何页面；只能改/删自己的记录和留言。
- 小组只能通过邀请码加入，最多 10 人。
- 整站 `noindex` + `robots.txt` 禁止搜索引擎收录；没有公开分享链接。

## 小提示
- 「今天」按每个人自己的时区计算（第一次登录时自动识别，可在设置里改）。
- Supabase 自带的邮件服务每小时只能发很少几封登录邮件，两三个人用够了；人多的话可以在 Authentication → SMTP 里接入 Resend 等免费邮件服务。
- Supabase 免费项目如果长时间没人使用可能会被暂停（数据不会丢，在控制台点一下就恢复），每天有人写记录就不会遇到。
