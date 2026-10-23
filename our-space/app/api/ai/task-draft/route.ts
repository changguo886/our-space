import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, allowRequest, generateStructured } from "@/lib/ai/provider";
import { TASK_DRAFT_SCHEMA, buildInstructions, normalizeDraft } from "@/lib/ai/task-draft";

export const runtime = "nodejs";

const MAX_PROMPT = 2000;

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "请先登录 / Sign in first" }, { status: 401 });

  let prompt = "";
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8000) return NextResponse.json({ error: "描述太长了" }, { status: 413 });
    const body = JSON.parse(raw) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ error: "无效请求" }, { status: 400 });
  }
  if (!prompt || prompt.length > MAX_PROMPT) return NextResponse.json({ error: "请输入 1–2000 字的任务描述" }, { status: 400 });
  if (!allowRequest(user.id)) return NextResponse.json({ error: "太频繁了，请一分钟后再试" }, { status: 429 });
  if (!aiConfigured()) return NextResponse.json({ error: "AI 尚未配置（缺少 OPENAI_API_KEY）" }, { status: 503 });

  const { data: profile } = await db.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timezone = typeof profile?.timezone === "string" ? profile.timezone : "UTC";
  let today: string, weekday: string;
  try {
    const now = new Date();
    today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(now);
  } catch {
    today = new Date().toISOString().slice(0, 10);
    weekday = "";
  }

  const result = await generateStructured({
    instructions: buildInstructions(today, timezone, weekday),
    input: prompt,
    schemaName: "task_draft",
    schema: TASK_DRAFT_SCHEMA,
    maxOutputTokens: 2000,
  });
  if (!result.ok) {
    const message = {
      quota: "AI 配额不足或请求过于频繁",
      truncated: "描述有点复杂，AI 没写完，请精简后重试",
      refused: "AI 无法处理这条描述，请换个说法",
      failed: "AI 暂时不可用，请稍后重试",
    }[result.reason];
    return NextResponse.json({ error: message }, { status: result.reason === "quota" ? 429 : 502 });
  }

  try {
    const zh = /[一-鿿]/.test(prompt);
    return NextResponse.json({ draft: normalizeDraft(result.json, today, zh), today });
  } catch {
    return NextResponse.json({ error: "没能从描述中提取任务，请写得更具体一些" }, { status: 422 });
  }
}
