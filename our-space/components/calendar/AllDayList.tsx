"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoutineCheckIn from "@/components/RoutineCheckIn";
import { habitEligible, type HabitPatternV3 } from "@/lib/recurring-execution";

type DayTask = { id: string; title: string; status: string; task_type?: string | null; task_date?: string | null; category?: string | null };

function localToday() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/**
 * "All day" section at the top of the Calendar day view:
 * - one-time tasks dated this day: a checkbox (completes the task, no focus data invented);
 * - projects dated this day: listed, completed from their own workspace;
 * - routines due this day: a check-in that records one completion event, never completes the routine.
 * Timed plans stay on the hourly grid below.
 */
export default function AllDayList({ date, todos, patterns, zh }: { date: string; todos: DayTask[]; patterns: Record<string, HabitPatternV3>; zh: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const today = localToday();

  const dated = todos.filter((t) => t.task_date === date && (t.task_type ?? "one_time") !== "routine" && t.task_type !== "habit");
  const routines = todos.filter((t) => (t.task_type === "routine" || t.task_type === "habit") && patterns[t.id]
    && habitEligible(date, patterns[t.id], t.task_date ?? date));
  if (!dated.length && !routines.length) return null;

  async function toggle(task: DayTask) {
    if ((task.task_type ?? "one_time") !== "one_time") return;
    setBusy(task.id); setError("");
    const done = task.status === "completed";
    const { error: e } = await createClient().from("todos")
      .update({ status: done ? "pending" : "completed", started_at: null, completed_at: done ? null : new Date().toISOString() })
      .eq("id", task.id);
    setBusy(null);
    if (e) { setError(e.message); return; }
    router.refresh();
  }

  return <section aria-label={zh ? "全天待办" : "All-day to-dos"} className="rounded-2xl border border-line bg-white p-4">
    <h3 className="mb-2 text-sm font-semibold text-ink">{zh ? "全天待办" : "All day"}</h3>
    <ul className="space-y-1">
      {dated.map((t) => {
        const done = t.status === "completed";
        const oneTime = (t.task_type ?? "one_time") === "one_time";
        return <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-paper/60">
          {oneTime
            ? <button type="button" disabled={busy === t.id} onClick={() => void toggle(t)} aria-pressed={done}
                aria-label={done ? (zh ? "标记为未完成" : "Mark not done") : (zh ? "完成" : "Complete")} className="flex h-8 w-8 items-center justify-center rounded-full">
                {done ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white"><Check className="h-4 w-4" /></span> : <Circle className="h-6 w-6 text-ink-faint" />}
              </button>
            : <span className="w-8 text-center text-[10px] text-ink-soft">{zh ? "长期" : "Project"}</span>}
          <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-ink-faint line-through" : "text-ink"}`}>{t.title}</span>
        </li>;
      })}
      {routines.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-1.5 hover:bg-paper/60">
        <span className="flex w-8 justify-center"><Repeat aria-label={zh ? "周期任务" : "Routine"} className="h-4 w-4 text-sage-600" /></span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
        {date <= today
          ? <RoutineCheckIn compact todoId={t.id} day={date} onChange={() => router.refresh()} />
          : <span className="text-xs text-ink-faint">{zh ? "当天可以打卡" : "Check in on the day"}</span>}
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
