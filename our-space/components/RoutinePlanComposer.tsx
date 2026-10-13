"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppTimePicker from "@/components/ui/AppTimePicker";
import { ModePicker } from "@/components/ui/ScheduleMode";
import { addDaysISO, lastDayISO, weekdayISO, type HabitPatternV3 } from "@/lib/recurring-execution";
import { conflictsWith, formatDay, isDuplicateKeyError, remainingQuota, timesOverlap, type DatedItem, type ScheduleMode as Mode } from "@/lib/schedule-utils";

type Slot = { id: string; key: string; mode: Mode; start: string; end: string; minutes: string };
type Props = { todoId: string; pattern: HabitPatternV3; today: string; startDate: string; existing: DatedItem[]; onSaved: () => Promise<void>; zh: boolean };
const pad = (n: number) => String(n).padStart(2, "0");
const dayAt = (year: number, month: number, day: number) => year + "-" + pad(month) + "-" + pad(day);
const validTime = (x: string) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(x);
const toIso = (d: string, t: string) => new Date(d + "T" + t + ":00").toISOString();
const span = (a: string, b: string) => Number(b.slice(0, 2)) * 60 + Number(b.slice(3)) - Number(a.slice(0, 2)) * 60 - Number(a.slice(3));
const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

export default function RoutinePlanComposer({ todoId, pattern, today, startDate, existing, onSaved, zh }: Props) {
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [shared, setShared] = useState<Omit<Slot, "id" | "key">>({ mode: "fixed", start: "09:00", end: "10:00", minutes: "45" });
  const [scope, setScope] = useState<"period" | "ongoing">("period");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ sig: string; ids: string[] } | null>(null);

  const weekly = pattern.period !== "month";
  const fixed = pattern.arrangement === "fixed";
  const flexibleQuota = pattern.arrangement === "flexible" && pattern.period !== "day";
  const unit = weekly ? (zh ? "周" : "week") : (zh ? "月" : "month");
  const [year, month] = anchor.split("-").map(Number);
  const weekStart = addDaysISO(anchor, 1 - weekdayISO(anchor));
  const periodStart = weekly ? weekStart : dayAt(year, month, 1);
  const periodEnd = weekly ? addDaysISO(weekStart, 6) : dayAt(year, month, lastDayISO(anchor));
  const values = weekly ? [1, 2, 3, 4, 5, 6, 7] : Array.from({ length: lastDayISO(anchor) }, (_, i) => i + 1);
  const dayFor = (v: number) => weekly ? addDaysISO(weekStart, v - 1) : dayAt(year, month, v);
  const eligible = (v: number) => { const d = dayFor(v); return d >= today && d >= startDate; };
  const ruleKeys = () => pattern.period === "day" ? [1, 2, 3, 4, 5, 6, 7] : pattern.period === "week" ? pattern.weekdays : [...pattern.month_days, ...(pattern.include_month_end ? [lastDayISO(anchor)] : [])];

  // Flexible N-per-period: how many dates are already planned in the shown period, and how many more fit.
  const plannedThisPeriod = new Set(existing.filter((r) => r.day >= periodStart && r.day <= periodEnd).map((r) => r.day)).size;
  const cap = flexibleQuota ? (scope === "period" ? remainingQuota(pattern.target_count, plannedThisPeriod) : pattern.target_count) : Infinity;

  useEffect(() => {
    setSelected(fixed ? [...new Set(ruleKeys())].filter(eligible).sort((a, b) => a - b) : []);
    setSlots([]); setError("");
  }, [todoId, anchor, pattern.arrangement, pattern.period, pattern.weekdays.join(","), pattern.month_days.join(","), pattern.include_month_end]);

  const chosen = selected.filter(eligible);
  const choose = (ids: number[]) => setSelected([...new Set(ids.filter(eligible))].sort((a, b) => a - b).slice(0, cap));
  const toggle = (v: number) => selected.includes(v) ? setSelected(selected.filter((x) => x !== v)) : selected.length < cap && choose([...selected, v]);

  const apply = () => {
    if (!chosen.length) { setError(zh ? "先选日子。" : "Pick days first."); return; }
    setSlots((prev) => [...prev, ...chosen.map((day) => ({ id: crypto.randomUUID(), key: String(day), ...shared }))].sort((a, b) => Number(a.key) - Number(b.key) || a.start.localeCompare(b.start)));
    setError("");
  };
  const update = (id: string, changes: Partial<Slot>) => setSlots((rows) => rows.map((r) => r.id === id ? { ...r, ...changes } : r));

  async function insertOnce(table: string, records: Array<Record<string, unknown>>) {
    const sig = table + JSON.stringify(records);
    if (pending.current?.sig !== sig) pending.current = { sig, ids: records.map(() => crypto.randomUUID()) };
    const result = await createClient().from(table).insert(records.map((r, i) => ({ ...r, id: pending.current!.ids[i] })));
    if (result.error && !isDuplicateKeyError(result.error)) return result.error.message;
    pending.current = null;
    return "";
  }

  const save = async () => {
    setError("");
    if (!slots.length) { setError(zh ? "先把时间应用到至少一天。" : "Apply a time to at least one day."); return; }
    for (const s of slots) {
      if (!eligible(Number(s.key))) { setError(zh ? "有日子已经过去了。" : "A selected day has passed."); return; }
      if (s.mode !== "flexible" && (!validTime(s.start) || !validTime(s.end) || s.end <= s.start)) { setError(zh ? "结束时间要晚于开始时间（暂不支持跨天）。" : "End must be after start (same day)."); return; }
      const mins = Number(s.minutes);
      if (s.mode !== "fixed" && (!Number.isInteger(mins) || mins < 1 || mins > 1440)) { setError(zh ? "预计时长请填 1–1440 分钟。" : "Minutes must be 1–1440."); return; }
      if (s.mode === "window" && mins > span(s.start, s.end)) { setError(zh ? "预计时长不能超过这段时间。" : "Minutes exceed the window."); return; }
    }
    const asItems = slots.map((s) => ({ id: s.id, day: dayFor(Number(s.key)), mode: s.mode, start: s.mode === "flexible" ? "" : s.start, end: s.mode === "flexible" ? "" : s.end, minutes: s.mode === "fixed" ? span(s.start, s.end) : Number(s.minutes) }));
    if (asItems.some((a, i) => conflictsWith(a, asItems.slice(i + 1)))) { setError(zh ? "同一天里有重叠或重复的时间。" : "Two slots on the same day overlap."); return; }
    if (scope === "ongoing" && !weekly && slots.some((s) => Number(s.key) > 28)
      && !window.confirm(zh ? "29–31 号不是每个月都有，没有这些日子的月份会跳过。继续？" : "Days 29–31 are skipped in shorter months. Continue?")) return;

    setBusy(true);
    let failure = "";
    if (scope === "ongoing") {
      const startsOn = [periodStart, today, startDate].sort().at(-1)!;
      const records = slots.map((s) => {
        const monthEnd = !weekly && pattern.include_month_end && Number(s.key) === lastDayISO(anchor) && !pattern.month_days.includes(Number(s.key));
        return {
          todo_id: todoId, starts_on: startsOn, ends_on: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          selector_kind: weekly ? "weekday" : monthEnd ? "month_end" : "month_day", selector_value: monthEnd ? null : Number(s.key),
          execution_mode: s.mode, replaces_slot_key: null,
          start_time: s.mode === "fixed" ? s.start : null, end_time: s.mode === "fixed" ? s.end : null,
          window_start: s.mode === "window" ? s.start : null, window_end: s.mode === "window" ? s.end : null,
          planned_minutes: s.mode === "fixed" ? null : Number(s.minutes),
        };
      });
      const current = await createClient().from("todo_execution_templates").select("selector_kind,selector_value,ends_on,execution_mode,start_time,end_time,window_start,window_end,planned_minutes").eq("todo_id", todoId);
      if (current.error) failure = current.error.message;
      else if (records.some((r) => (current.data ?? []).some((t) => t.selector_kind === r.selector_kind && t.selector_value === r.selector_value && (t.ends_on === null || t.ends_on >= r.starts_on) && t.execution_mode === r.execution_mode && (
        r.execution_mode === "fixed" ? timesOverlap(r.start_time!, r.end_time!, t.start_time.slice(0, 5), t.end_time.slice(0, 5))
          : r.execution_mode === "window" ? r.window_start === t.window_start?.slice(0, 5) && r.window_end === t.window_end?.slice(0, 5) && r.planned_minutes === t.planned_minutes
            : r.planned_minutes === t.planned_minutes))))
        failure = zh ? "这些日子已经有相同或重叠的重复安排，请在列表里修改。" : "A matching repeating plan already exists; edit it in the list.";
      else failure = await insertOnce("todo_execution_templates", records);
    } else {
      if (asItems.some((a) => conflictsWith(a, existing))) failure = zh ? "有的日子已经有重叠或相同的安排了。" : "Some days already have a matching plan.";
      else failure = await insertOnce("todo_sessions", asItems.map((a) => a.mode === "fixed"
        ? { todo_id: todoId, mode: "fixed", scheduled_start: toIso(a.day, a.start), scheduled_end: toIso(a.day, a.end) }
        : { todo_id: todoId, mode: a.mode, plan_date: a.day, planned_minutes: a.minutes, window_start: a.mode === "window" ? a.start : null, window_end: a.mode === "window" ? a.end : null }));
    }
    setBusy(false);
    if (failure) { setError(failure); return; }
    setSlots([]);
    await onSaved();
  };

  const scopeButton = (id: "period" | "ongoing", label: string) => <button type="button" aria-pressed={scope === id} onClick={() => { setScope(id); if (flexibleQuota) setSelected([]); }}
    className={`flex-1 rounded-lg px-3 py-2 text-sm ${scope === id ? "bg-white font-semibold text-sage-700 shadow-sm" : "text-ink-soft"}`}>{label}</button>;

  return <div className="space-y-4">
    <div className="flex rounded-xl bg-paper p-1">
      {scopeButton("period", zh ? `只排这${unit}` : `This ${unit} only`)}
      {scopeButton("ongoing", zh ? `每${unit}都这样` : `Every ${unit}`)}
    </div>

    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label={zh ? "上一个周期" : "Previous"} className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setAnchor(weekly ? addDaysISO(anchor, -7) : dayAt(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, 1))}>‹</button>
      <strong className="text-sm">{weekly ? `${formatDay(periodStart, zh)} – ${formatDay(periodEnd, zh)}` : (zh ? `${year} 年 ${month} 月` : `${year}-${pad(month)}`)}</strong>
      <button type="button" aria-label={zh ? "下一个周期" : "Next"} className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setAnchor(weekly ? addDaysISO(anchor, 7) : dayAt(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1))}>›</button>
    </div>

    {flexibleQuota && <p className="text-xs text-sage-700">{zh
      ? `目标每${unit} ${pattern.target_count} 次${scope === "period" ? ` · 这${unit}已排 ${plannedThisPeriod} 天，还能选 ${cap} 天` : ""}`
      : `Goal ${pattern.target_count} per ${unit}${scope === "period" ? ` · ${plannedThisPeriod} planned, ${cap} left` : ""}`}</p>}

    {weekly && <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => choose([1, 2, 3, 4, 5])} className="rounded-lg border border-line px-3 py-1.5 text-xs">{zh ? "工作日" : "Weekdays"}</button>
      <button type="button" onClick={() => choose([6, 7])} className="rounded-lg border border-line px-3 py-1.5 text-xs">{zh ? "周末" : "Weekend"}</button>
      <button type="button" onClick={() => setSelected([])} className="rounded-lg px-3 py-1.5 text-xs text-ink-soft">{zh ? "清空" : "Clear"}</button>
    </div>}

    <div className="grid grid-cols-7 gap-1">
      {values.map((v) => {
        const on = selected.includes(v), rule = fixed && ruleKeys().includes(v);
        return <button key={v} type="button" disabled={!eligible(v) || (!on && selected.length >= cap)} aria-pressed={on} onClick={() => toggle(v)} title={formatDay(dayFor(v), zh)}
          className={`relative min-h-10 rounded-lg border text-xs disabled:opacity-30 ${on ? "border-sage-500 bg-sage-100 font-semibold text-sage-700" : "border-line bg-white"}`}>
          {weekly ? (zh ? WEEK[v - 1] : ["M", "T", "W", "T", "F", "S", "S"][v - 1]) : v}
          {rule && <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sage-600" />}
        </button>;
      })}
    </div>

    <div className="space-y-2 rounded-xl border border-line bg-white p-3">
      <ModePicker value={shared.mode} onChange={(m) => setShared((s) => ({ ...s, mode: m }))} zh={zh} />
      {shared.mode !== "flexible" && <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">{shared.mode === "window" ? (zh ? "最早" : "From") : (zh ? "开始" : "Start")}<AppTimePicker value={shared.start} onChange={(v) => setShared((s) => ({ ...s, start: v }))} /></label>
        <label className="text-xs text-ink-soft">{shared.mode === "window" ? (zh ? "最晚" : "Until") : (zh ? "结束" : "End")}<AppTimePicker value={shared.end} onChange={(v) => setShared((s) => ({ ...s, end: v }))} /></label>
      </div>}
      {shared.mode !== "fixed" && <label className="block text-xs text-ink-soft">{zh ? "大概多久（分钟）" : "About how long (min)"}<input type="number" min={1} max={1440} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" value={shared.minutes} onChange={(e) => setShared((s) => ({ ...s, minutes: e.target.value }))} /></label>}
      <button type="button" onClick={apply} disabled={!chosen.length} className="w-full rounded-lg border border-sage-400 bg-white p-2 text-sm text-sage-700 disabled:opacity-40">{zh ? `用到选中的 ${chosen.length} 天` : `Use for ${chosen.length} days`}</button>
    </div>

    {slots.length > 0 && <div className="space-y-2">
      {slots.map((s) => <div key={s.id} className="space-y-2 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center justify-between">
          <strong className="text-xs">{scope === "ongoing" ? (weekly ? (zh ? `每周${WEEK[Number(s.key) - 1]}` : `Every ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(s.key) - 1]}`) : (zh ? `每月 ${s.key} 日` : `Day ${s.key} monthly`)) : formatDay(dayFor(Number(s.key)), zh)}</strong>
          <button type="button" className="text-xs text-ink-soft" onClick={() => setSlots((xs) => xs.filter((x) => x.id !== s.id))}>{zh ? "移除" : "Remove"}</button>
        </div>
        <ModePicker compact value={s.mode} onChange={(m) => update(s.id, { mode: m })} zh={zh} />
        {s.mode !== "flexible" && <div className="grid grid-cols-2 gap-2"><AppTimePicker value={s.start} onChange={(v) => update(s.id, { start: v })} /><AppTimePicker value={s.end} onChange={(v) => update(s.id, { end: v })} /></div>}
        {s.mode !== "fixed" && <input type="number" aria-label={zh ? "预计分钟" : "Minutes"} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" value={s.minutes} onChange={(e) => update(s.id, { minutes: e.target.value })} />}
      </div>)}
    </div>}

    <button type="button" disabled={busy || !slots.length} className="btn-primary w-full" onClick={() => void save()}>{busy ? (zh ? "保存中…" : "Saving…") : (zh ? "保存" : "Save")}</button>
    {error && <p role="alert" className="text-xs text-blush-500">{error}</p>}
  </div>;
}
