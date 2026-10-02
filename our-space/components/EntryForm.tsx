"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookText, PenLine, Send, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Fields = { today_tasks: string; today_note: string; tomorrow_plan: string };

const QUESTIONS: { key: keyof Fields; label: string; placeholder: string; Icon: typeof PenLine; rows: number }[] = [
  { key: "today_tasks", label: "今天做了什么？", placeholder: "比如：背了50个单词 / 看了一个工作岗位 / 去了超市 / 好好吃了一顿饭…", Icon: NotebookText, rows: 3 },
  { key: "today_note", label: "今天想说的一句话", placeholder: "比如：今天心情还不错 / 有点焦虑 / 很舍不得同事…", Icon: PenLine, rows: 2 },
  { key: "tomorrow_plan", label: "明天想做什么？", placeholder: "比如：看一篇论文 / 去吃想吃的店 / 早点睡…", Icon: Send, rows: 2 },
];

export default function EntryForm({
  groupId,
  userId,
  entryDate,
  initial,
}: {
  groupId: string;
  userId: string;
  entryDate: string;
  initial: Fields;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Fields>(initial);
  const [saved, setSaved] = useState<Fields>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const clean = (s: string) => (s.trim() ? s.trim() : null);
   const { error } = await createClient()
  .from("daily_entries")
  .upsert(
    {
      user_id: userId,
      group_id: groupId,
      entry_date: entryDate,
      today_tasks: clean(values.today_tasks),
      today_note: clean(values.today_note),
      tomorrow_plan: clean(values.tomorrow_plan),
    },
    {
      onConflict:
        "user_id,group_id,entry_date",
    }
  );
    setBusy(false);
 if (error) {
  console.error(
    "Save daily entry failed:",
    error
  );

  setMsg({
    ok: false,
    text: `保存失败：${error.message}`,
  });

  return;
}

  return (
    <form onSubmit={save} className="mt-6 space-y-4">
      {QUESTIONS.map(({ key, label, placeholder, Icon, rows }) => (
        <div key={key} className="card p-5">
          <label htmlFor={key} className="label">
            <Icon className="h-4 w-4 text-ink-soft" strokeWidth={1.8} />
            {label}
          </label>
          <textarea
            id={key}
            rows={rows}
            maxLength={4000}
            className="input resize-none border-transparent bg-cream/60"
            placeholder={placeholder}
            value={values[key]}
            onChange={(e) => {
              setValues({ ...values, [key]: e.target.value });
              setMsg(null);
            }}
          />
        </div>
      ))}

      <button className="btn-primary w-full py-3.5" disabled={busy || (!dirty && msg?.ok !== false)}>
        {busy ? "保存中…" : "保存今天的记录"}
      </button>
      <div className="h-5 text-center text-sm">
        {msg ? (
          <span className={msg.ok ? "inline-flex items-center gap-1 text-sage-700" : "text-blush-500"}>
            {msg.ok && <Check className="h-4 w-4" />}
            {msg.text}
          </span>
        ) : dirty ? (
          <span className="text-ink-faint">还没保存</span>
        ) : null}
      </div>
    </form>
  );
}
