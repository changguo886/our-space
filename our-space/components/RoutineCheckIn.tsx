"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { periodLabel, periodRange, periodTarget, type RoutineRule } from "@/lib/schedule-utils";

type Log = { id: string; occurred_on: string; completed_at: string; duration_minutes: number | null };

function localDate(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }

/** Message for an RPC that does not exist yet (migration not applied). */
function missingMigration(message: string, zh: boolean) {
  return /log_completion_v4|undo_completion_v4|PGRST202|Could not find the function/i.test(message)
    ? (zh ? "打卡功能需要先执行数据库更新 v4_10。" : "Check-ins need database migration v4_10.")
    : message;
}

/**
 * Check-in for a routine: each tap records ONE completion event (habit_logs) for `day`.
 * The parent task stays active, no focus time is invented, and the last tap can be undone.
 * Idempotency: one client_event_id per tap, reused if that tap is retried.
 */
export default function RoutineCheckIn({ todoId, day, onChange }: { todoId: string; day?: string; onChange?: () => void }) {
  const { language } = useI18n();
  const zh = language === "zh-CN";
  const target = day ?? localDate(new Date());
  const [rule, setRule] = useState<RoutineRule | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const db = createClient();
    const r = await db.from("habit_patterns_v3").select("period,arrangement,target_count,weekdays,month_days,include_month_end").eq("todo_id", todoId).maybeSingle();
    if (r.error || !r.data) { setRule(null); return; }
    const nextRule = r.data as RoutineRule;
    setRule(nextRule);
    const range = periodRange(target, nextRule.period);
    const l = await db.from("habit_logs").select("id,occurred_on,completed_at,duration_minutes")
      .eq("todo_id", todoId).gte("occurred_on", range.start).lte("occurred_on", range.end).order("completed_at", { ascending: false });
    if (l.error) setError(missingMigration(l.error.message, zh)); else setLogs((l.data ?? []) as Log[]);
  }, [todoId, target, zh]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  async function checkIn() {
    if (busy) return;
    setBusy(true); setError("");
    const key = pendingKey.current ?? (pendingKey.current = crypto.randomUUID());
    const res = await createClient().rpc("log_completion_v4", { p_todo_id: todoId, p_client_event_id: key, p_occurred_on: target });
    setBusy(false);
    if (res.error) { setError(missingMigration(res.error.message, zh)); return; } // key kept: retry reuses it
    pendingKey.current = null;
    setUndoId(res.data as string);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoId(null), 6000);
    await load(); onChange?.();
  }

  async function undo(id: string, confirmFirst = false) {
    if (confirmFirst && !window.confirm(zh ? "删除这条打卡记录？" : "Delete this check-in?")) return;
    setBusy(true); setError("");
    const res = await createClient().rpc("undo_completion_v4", { p_log_id: id });
    setBusy(false);
    if (res.error) { setError(missingMigration(res.error.message, zh)); return; }
    setUndoId(null);
    await load(); onChange?.();
  }

  if (!rule) return null;
  const goal = periodTarget(rule, target);
  const done = logs.length;
  const reached = goal > 0 && done >= goal;

  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    <button type="button" disabled={busy} onClick={() => void checkIn()}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition disabled:opacity-50 ${reached ? "border-sage-200 bg-white text-sage-700" : "border-sage-500 bg-sage-50 text-sage-700 hover:bg-sage-100"}`}>
      <Check className="h-3.5 w-3.5" />{zh ? "打卡一次" : "Check in"}
    </button>
    <span className="text-ink-soft">{periodLabel(rule.period, zh)} <strong className="text-ink">{done}</strong>/{goal}{reached ? (zh ? " · 已达成" : " · done") : ""}</span>
    {goal > 0 && goal <= 12 && <span aria-hidden="true" className="flex gap-0.5">
      {Array.from({ length: goal }, (_, i) => <span key={i} className={`h-1.5 w-3 rounded-full ${i < done ? "bg-sage-500" : "bg-line"}`} />)}
    </span>}
    {undoId && <button type="button" disabled={busy} onClick={() => void undo(undoId)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ink-soft underline-offset-2 hover:underline">
      <Undo2 className="h-3.5 w-3.5" />{zh ? "撤销" : "Undo"}
    </button>}
    {done > 0 && <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="rounded-lg px-2 py-1 text-ink-soft underline-offset-2 hover:underline">{showLog ? (zh ? "收起记录" : "Hide") : (zh ? "记录" : "History")}</button>}
    {error && <span role="alert" className="text-blush-500">{error}</span>}
    {showLog && <ul className="w-full space-y-0.5 pt-1">
      {logs.map((log) => {
        const at = new Date(log.completed_at);
        const when = `${log.occurred_on.slice(5).replace("-", "/")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        return <li key={log.id} className="flex items-center gap-2 text-ink-soft">
          <Check className="h-3 w-3 text-sage-600" /><span className="tabular-nums">{when}</span>
          {log.duration_minutes ? <span>· {log.duration_minutes} {zh ? "分钟" : "min"}</span> : null}
          <button type="button" disabled={busy} onClick={() => void undo(log.id, log.id !== undoId)} className="ml-auto rounded px-1.5 text-ink-faint hover:text-blush-500" aria-label={zh ? "删除这条记录" : "Delete check-in"}>×</button>
        </li>;
      })}
    </ul>}
  </div>;
}
