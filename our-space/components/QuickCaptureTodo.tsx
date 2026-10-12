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
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-[#FBFCFA] p-1.5 transition focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100">
        <span aria-hidden="true" className="pl-2 text-lg font-light text-sage-600">+</span>
        <input aria-label="快速添加任务" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-ink-faint" placeholder="想做什么？输入后按 Enter" value={title} onChange={event=>setTitle(event.target.value)} disabled={busy} maxLength={200}/>
        <button type="submit" disabled={busy||!title.trim()} className="shrink-0 rounded-lg bg-sage-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-40">{busy?"保存中…":"添加"}</button>
      </div>
      {error&&<p role="alert" className="text-xs text-blush-500">创建失败：{error}</p>}
    </form>
  );
}
