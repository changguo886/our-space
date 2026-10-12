"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { userId: string; taskDate: string };

export default function QuickCaptureTodo({ userId, taskDate }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      // Compatibility: the existing Today/Overdue readers require task_date.
      // Unscheduled/Inbox will be introduced only after a schema+reader audit.
      const { error: createError } = await createClient().from("todos").insert({
        user_id: userId,
        title: value,
        task_date: taskDate,
        task_type: "one_time",
      });
      if (createError) throw createError;
      setTitle("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="任务名称 / Task name" className="input min-w-0 flex-1" placeholder="想做什么？例如：买牛奶 / What needs doing?" value={title} onChange={event=>setTitle(event.target.value)} disabled={busy} maxLength={200} />
        <button type="submit" disabled={busy || !title.trim()} className="btn-primary shrink-0">{busy ? "保存中…" : "快速添加"}</button>
      </div>
      <p className="text-xs text-ink-faint">快速记录为单次任务，暂归入今天；未安排 Inbox 会在日期模型迁移后启用。需要重复或习惯计划，请展开下方设置。</p>
      {error && <p role="alert" className="text-xs text-blush-500">创建失败：{error}</p>}
    </form>
  );
}
