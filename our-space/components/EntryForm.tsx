"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookText, PenLine, Send, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";

type Fields = { today_tasks: string; today_note: string; tomorrow_plan: string };

const QUESTIONS: {
  key: keyof Fields;
  labelKey:
    | "todayTasks"
    | "todayNote"
    | "tomorrowPlan";
  placeholderKey:
    | "todayTasksPlaceholder"
    | "todayNotePlaceholder"
    | "tomorrowPlanPlaceholder";
  Icon: typeof PenLine;
  rows: number;
}[] = [
  {
    key: "today_tasks",
    labelKey: "todayTasks",
    placeholderKey: "todayTasksPlaceholder",
    Icon: NotebookText,
    rows: 3,
  },
  {
    key: "today_note",
    labelKey: "todayNote",
    placeholderKey: "todayNotePlaceholder",
    Icon: PenLine,
    rows: 2,
  },
  {
    key: "tomorrow_plan",
    labelKey: "tomorrowPlan",
    placeholderKey: "tomorrowPlanPlaceholder",
    Icon: Send,
    rows: 2,
  },
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
  const { dictionary } = useI18n();
  const t = dictionary.today.journal;
  const common = dictionary.common;
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
    text: t.saveFailed + error.message,
  });

  return;
}

setSaved(values);

setMsg({
  ok: true,
  text: t.saved,
});

router.refresh();
}

  return (
    <form onSubmit={save} className="mt-6 space-y-4">
      {QUESTIONS.map(({ key, labelKey, placeholderKey, Icon, rows }) => (
        <div key={key} className="card p-5">
          <label htmlFor={key} className="label">
            <Icon className="h-4 w-4 text-ink-soft" strokeWidth={1.8} />
            {t[labelKey]}
          </label>
          <textarea
            id={key}
            rows={rows}
            maxLength={4000}
            className="input resize-none border-transparent bg-cream/60"
            placeholder={t[placeholderKey]}
            value={values[key]}
            onChange={(e) => {
              setValues({ ...values, [key]: e.target.value });
              setMsg(null);
            }}
          />
        </div>
      ))}

      <button className="btn-primary w-full py-3.5" disabled={busy || (!dirty && msg?.ok !== false)}>
        {busy ? common.saving : t.save}
      </button>
      <div className="h-5 text-center text-sm">
        {msg ? (
          <span className={msg.ok ? "inline-flex items-center gap-1 text-sage-700" : "text-blush-500"}>
            {msg.ok && <Check className="h-4 w-4" />}
            {msg.text}
          </span>
        ) : dirty ? (
          <span className="text-ink-faint">{t.unsaved}</span>
        ) : null}
      </div>
    </form>
  );
}
