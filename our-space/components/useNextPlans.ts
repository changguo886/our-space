"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysISO, templateEligible, type ExecutionTemplateV3 } from "@/lib/recurring-execution";
import { hhmm, type NextPlan, type ScheduleMode } from "@/lib/schedule-utils";

function localDate(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }
function localTime(d: Date) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
const earlier = (a: NextPlan | undefined, b: NextPlan) => !a || b.day < a.day || (b.day === a.day && b.start < a.start) ? b : a;

/**
 * Next upcoming plan per task (today or later): dated sessions and repeating slots,
 * skipping occurrences cancelled by an override. Read-only; used for the card status line.
 */
export function useNextPlans(todoIds: string[]): Record<string, NextPlan> {
  const [plans, setPlans] = useState<Record<string, NextPlan>>({});
  const key = [...todoIds].sort().join(",");
  useEffect(() => {
    if (!todoIds.length) { setPlans({}); return; }
    let alive = true;
    (async () => {
      const db = createClient();
      const today = localDate(new Date());
      const [s, t, o] = await Promise.all([
        db.from("todo_sessions").select("todo_id,mode,plan_date,scheduled_start,scheduled_end,window_start,window_end").in("todo_id", todoIds),
        db.from("todo_execution_templates").select("todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,window_start,window_end,planned_minutes,timezone,id").in("todo_id", todoIds),
        db.from("todo_execution_overrides").select("todo_id,slot_key,occurrence_date,action").in("todo_id", todoIds).gte("occurrence_date", today),
      ]);
      const next: Record<string, NextPlan> = {};
      for (const row of (s.data ?? []) as Array<{ todo_id: string; mode: ScheduleMode | null; plan_date: string | null; scheduled_start: string | null; scheduled_end: string | null; window_start: string | null; window_end: string | null }>) {
        let plan: NextPlan | null = null;
        if ((row.mode ?? "fixed") === "fixed" && row.scheduled_start && row.scheduled_end) {
          const a = new Date(row.scheduled_start), b = new Date(row.scheduled_end);
          plan = { day: localDate(a), mode: "fixed", start: localTime(a), end: localTime(b) };
        } else if (row.plan_date) plan = { day: row.plan_date, mode: row.mode as ScheduleMode, start: hhmm(row.window_start), end: hhmm(row.window_end) };
        if (plan && plan.day >= today) next[row.todo_id] = earlier(next[row.todo_id], plan);
      }
      const cancelled = new Set(((o.data ?? []) as Array<{ todo_id: string; slot_key: string; occurrence_date: string; action: string }>)
        .filter((x) => x.action === "cancel").map((x) => `${x.todo_id}|${x.slot_key}|${x.occurrence_date}`));
      for (const tpl of (t.data ?? []) as ExecutionTemplateV3[]) {
        if (tpl.ends_on && tpl.ends_on < today) continue;
        for (let i = 0; i < 42; i++) {
          const day = addDaysISO(today, i);
          if (!templateEligible(day, tpl) || cancelled.has(`${tpl.todo_id}|${tpl.slot_key}|${day}`)) continue;
          const fixed = tpl.execution_mode === "fixed";
          next[tpl.todo_id] = earlier(next[tpl.todo_id], { day, mode: tpl.execution_mode, start: hhmm(fixed ? tpl.start_time : tpl.window_start), end: hhmm(fixed ? tpl.end_time : tpl.window_end) });
          break;
        }
      }
      if (alive) setPlans(next);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return plans;
}
