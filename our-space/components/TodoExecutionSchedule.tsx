"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Repeat } from "lucide-react";
import AppDatePicker from "@/components/ui/AppDatePicker";
import AppTimePicker from "@/components/ui/AppTimePicker";
import CopyDateCalendar from "@/components/ui/CopyDateCalendar";
import { ModeIcon, ModePicker } from "@/components/ui/ScheduleMode";
import RoutinePlanComposer from "@/components/RoutinePlanComposer";
import { useI18n } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { addDaysISO, lastDayISO, weekdayISO, templateEligible, type HabitPatternV3, type ExecutionTemplateV3 } from "@/lib/recurring-execution";
import {
  fixedOverlap, sameNonFixed, describeSelectors, describeTiming, formatDay, groupTemplates, hhmm, isDuplicateKeyError,
  isEditable, remainingQuota, slotTiming, splitByToday, timesOverlap, type DatedItem, type ScheduleMode as Mode, type TemplateGroup, type TemplateLike,
} from "@/lib/schedule-utils";

type SessionRow = {
  id: string; mode: Mode | null; plan_date: string | null; scheduled_start: string | null; scheduled_end: string | null;
  planned_minutes: number | null; window_start: string | null; window_end: string | null;
};
type Draft = { day: string; mode: Mode; start: string; end: string; minutes: string };
type Panel =
  | { kind: "compose" }
  | { kind: "edit"; item: DatedItem }
  | { kind: "copy"; source: DatedItem }
  | { kind: "override"; group: TemplateGroup }
  | { kind: "revise"; group: TemplateGroup; slotKeys: string[] }
  | null;

function localDate(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }
function localTime(d: Date) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function validTime(v: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
function validDate(v: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d = new Date(v + "T12:00:00"); return !Number.isNaN(d.getTime()) && localDate(d) === v; }
function toIso(day: string, time: string) { return new Date(day + "T" + time + ":00").toISOString(); }
function spanMinutes(start: string, end: string) { return Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3)); }

function toItem(row: SessionRow): DatedItem | null {
  if ((row.mode ?? "fixed") === "fixed") {
    if (!row.scheduled_start || !row.scheduled_end) return null;
    const a = new Date(row.scheduled_start), b = new Date(row.scheduled_end);
    return { id: row.id, day: localDate(a), mode: "fixed", start: localTime(a), end: localTime(b), minutes: Math.round((b.getTime() - a.getTime()) / 60000) };
  }
  if (!row.plan_date) return null;
  return { id: row.id, day: row.plan_date, mode: row.mode as Mode, start: hhmm(row.window_start), end: hhmm(row.window_end), minutes: row.planned_minutes ?? 0 };
}

/** Columns for one todo_sessions row; every mode-specific column is set so a mode change satisfies the DB check. */
function sessionColumns(d: { day: string; mode: Mode; start: string; end: string; minutes: number }) {
  return d.mode === "fixed"
    ? { mode: "fixed" as const, scheduled_start: toIso(d.day, d.start), scheduled_end: toIso(d.day, d.end), plan_date: null, planned_minutes: null, window_start: null, window_end: null }
    : { mode: d.mode, scheduled_start: null, scheduled_end: null, plan_date: d.day, planned_minutes: d.minutes, window_start: d.mode === "window" ? d.start : null, window_end: d.mode === "window" ? d.end : null };
}

function draftError(d: Draft, zh: boolean): string {
  if (!validDate(d.day)) return zh ? "请选择有效日期。" : "Choose a valid date.";
  if (d.mode !== "flexible" && (!validTime(d.start) || !validTime(d.end) || d.end <= d.start)) return zh ? "结束时间要晚于开始时间（暂不支持跨天）。" : "End must be after start (same day).";
  const m = Number(d.minutes);
  if (d.mode !== "fixed" && (!Number.isInteger(m) || m < 1 || m > 1440)) return zh ? "预计时长请填 1–1440 分钟。" : "Minutes must be 1–1440.";
  if (d.mode === "window" && m > spanMinutes(d.start, d.end)) return zh ? "预计时长不能超过这段时间。" : "Minutes cannot exceed the window.";
  return "";
}

function DraftFields({ draft, setDraft, zh, showDate = true }: { draft: Draft; setDraft: (d: Draft) => void; zh: boolean; showDate?: boolean }) {
  return <div className="space-y-3">
    {showDate && <label className="block text-xs text-ink-soft">{zh ? "哪天" : "Date"}<AppDatePicker value={draft.day} onChange={(v) => setDraft({ ...draft, day: v })} /></label>}
    <ModePicker value={draft.mode} onChange={(m) => setDraft({ ...draft, mode: m })} zh={zh} />
    {draft.mode !== "flexible" && <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-ink-soft">{draft.mode === "window" ? (zh ? "最早" : "From") : (zh ? "开始" : "Start")}<AppTimePicker value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} /></label>
      <label className="text-xs text-ink-soft">{draft.mode === "window" ? (zh ? "最晚" : "Until") : (zh ? "结束" : "End")}<AppTimePicker value={draft.end} onChange={(v) => setDraft({ ...draft, end: v })} /></label>
    </div>}
    {draft.mode !== "fixed" && <label className="block text-xs text-ink-soft">{zh ? "大概多久（分钟）" : "About how long (min)"}
      <input className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" type="number" min={1} max={1440} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} /></label>}
  </div>;
}

function RowMenu({ zh, items }: { zh: boolean; items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  return <details className="relative shrink-0">
    <summary aria-label={zh ? "更多操作" : "More actions"} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-ink-soft hover:bg-paper [&::-webkit-details-marker]:hidden">
      <MoreHorizontal className="h-4 w-4" />
    </summary>
    <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-white p-1 shadow-lg">
      {items.map((it) => <button key={it.label} type="button"
        onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); it.onClick(); }}
        className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-paper ${it.danger ? "text-blush-500" : "text-ink"}`}>{it.label}</button>)}
    </div>
  </details>;
}

export default function TodoExecutionSchedule({ todoId }: { todoId: string }) {
  const { language } = useI18n();
  const zh = language === "zh-CN";
  const router = useRouter();
  const todayISO = localDate(new Date());
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  const [rows, setRows] = useState<DatedItem[]>([]);
  const [templates, setTemplates] = useState<ExecutionTemplateV3[]>([]);
  const [pattern, setPattern] = useState<HabitPatternV3 | null>(null);
  const [todoStart, setTodoStart] = useState("");
  const [projectEnd, setProjectEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<null | (() => void)>(null);
  const [notice, setNotice] = useState("");

  const [panel, setPanel] = useState<Panel>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plan") === "1" ? { kind: "compose" } : null);
  const [draft, setDraft] = useState<Draft>({ day: todayISO, mode: "flexible", start: "19:00", end: "20:00", minutes: "45" });
  const [followUp, setFollowUp] = useState<DatedItem | null>(null);
  const [copyChoice, setCopyChoice] = useState<"all" | "weekdays" | "dates">("dates");
  const [copyDays, setCopyDays] = useState<string[]>([]);
  const [continuation, setContinuation] = useState<DatedItem[] | null>(null);
  const [overrideDay, setOverrideDay] = useState(todayISO);
  const [overrideAction, setOverrideAction] = useState<"reschedule" | "cancel">("reschedule");
  const [overrideSlot, setOverrideSlot] = useState("");
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkStart, setBulkStart] = useState("19:00");
  const [bulkEnd, setBulkEnd] = useState("20:00");

  /** Client-generated ids keep a retried insert from creating a second copy (B10). */
  const pendingInsert = useRef<{ sig: string; ids: string[] } | null>(null);

  async function refresh() {
    const db = createClient();
    const [s, h, t, td] = await Promise.all([
      db.from("todo_sessions").select("id,mode,plan_date,scheduled_start,scheduled_end,planned_minutes,window_start,window_end").eq("todo_id", todoId),
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end").eq("todo_id", todoId).maybeSingle(),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end,replaces_slot_key").eq("todo_id", todoId),
      db.from("todos").select("task_date,plan_start_date,target_finish_date").eq("id", todoId).single(),
    ]);
    if (s.error) setError((zh ? "读取安排失败：" : "Could not load plans: ") + s.error.message);
    else setRows(((s.data ?? []) as SessionRow[]).map(toItem).filter((x): x is DatedItem => x !== null));
    if (!h.error) setPattern(h.data as HabitPatternV3 | null);
    if (!t.error) setTemplates((t.data ?? []) as ExecutionTemplateV3[]);
    if (!td.error && td.data) { setTodoStart(td.data.plan_start_date ?? td.data.task_date ?? ""); setProjectEnd(td.data.target_finish_date ?? null); }
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, [todoId]);

  /** Runs one write. On failure keeps a retry button (C08); on success reloads this panel and the rest of the page (D08). */
  async function run(action: () => Promise<string>, onDone?: () => void) {
    setBusy(true); setError(""); setRetry(null); setNotice("");
    let failure = "";
    try { failure = await action(); } catch (e) { failure = e instanceof Error ? e.message : String(e); }
    setBusy(false);
    if (failure) { setError(failure); setRetry(() => () => void run(action, onDone)); return; }
    onDone?.();
    await refresh();
    router.refresh();
  }

  async function insertOnce(table: "todo_sessions" | "todo_execution_templates", records: Array<Record<string, unknown>>): Promise<string> {
    const sig = table + JSON.stringify(records);
    if (pendingInsert.current?.sig !== sig) pendingInsert.current = { sig, ids: records.map(() => crypto.randomUUID()) };
    const ids = pendingInsert.current.ids;
    const result = await createClient().from(table).insert(records.map((r, i) => ({ ...r, id: ids[i] })));
    if (result.error && !isDuplicateKeyError(result.error)) return result.error.message;
    pendingInsert.current = null;
    return "";
  }

  const { upcoming, past } = useMemo(() => splitByToday(rows, todayISO), [rows, todayISO]);
  const groups = useMemo(() => groupTemplates(templates as unknown as TemplateLike[], todayISO), [templates, todayISO]);
  const isFlexibleQuota = Boolean(pattern && pattern.arrangement === "flexible" && pattern.period !== "day");

  // ---------- period helpers (routine) ----------
  const periodEnd = (day: string) => {
    if (pattern?.period === "week") return addDaysISO(day, 7 - weekdayISO(day));
    if (pattern?.period === "day") return day;
    const [y, m] = day.split("-").map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  };
  const periodStart = (day: string) => pattern?.period === "week" ? addDaysISO(day, 1 - weekdayISO(day)) : pattern?.period === "day" ? day : day.slice(0, 8) + "01";
  const ruleDay = (day: string) => !pattern || pattern.arrangement === "flexible" || pattern.period === "day"
    || (pattern.period === "week" && pattern.weekdays.includes(weekdayISO(day)))
    || (pattern.period === "month" && (pattern.month_days.includes(Number(day.slice(-2))) || (pattern.include_month_end && Number(day.slice(-2)) === lastDayISO(day))));

  // ---------- single plan ----------
  function openCompose() { setDraft({ day: todayISO, mode: "flexible", start: "19:00", end: "20:00", minutes: "45" }); setFollowUp(null); setPanel({ kind: "compose" }); }
  function saveOnce() {
    const problem = draftError(draft, zh);
    if (problem) { setError(problem); return; }
    if (draft.day < todayISO) { setError(zh ? "不能安排在过去的日期。" : "Cannot plan in the past."); return; }
    const candidate = { day: draft.day, mode: draft.mode, start: draft.start, end: draft.end, minutes: Number(draft.minutes) };
    if (fixedOverlap(candidate, rows)) { setError(zh ? "和这天的另一个固定时段重叠了。" : "Overlaps another fixed slot that day."); return; }
    if (sameNonFixed(candidate, rows) && !window.confirm(zh ? "这天已经有一条相同的安排。仍然再加一条吗？" : "That day already has an identical plan. Add another one?")) return;
    void run(
      () => insertOnce("todo_sessions", [{ todo_id: todoId, ...sessionColumns(candidate) }]),
      () => { setPanel(null); setFollowUp({ id: "new", ...candidate }); });
  }

  // ---------- edit / cancel one dated plan ----------
  function openEdit(item: DatedItem) {
    if (!isEditable(item.day, todayISO)) return;
    setDraft({ day: item.day, mode: item.mode, start: item.start || "19:00", end: item.end || "20:00", minutes: String(item.minutes || 45) });
    setPanel({ kind: "edit", item });
  }
  function saveEdit(item: DatedItem) {
    if (!isEditable(item.day, todayISO)) { setError(zh ? "过去的安排不能修改。" : "Past plans are read-only."); return; }
    const problem = draftError(draft, zh);
    if (problem) { setError(problem); return; }
    if (draft.day < todayISO) { setError(zh ? "不能改到过去的日期。" : "Cannot move a plan into the past."); return; }
    const next = { day: draft.day, mode: draft.mode, start: draft.start, end: draft.end, minutes: draft.mode === "fixed" ? spanMinutes(draft.start, draft.end) : Number(draft.minutes) };
    const others = rows.filter((r) => r.id !== item.id);
    if (fixedOverlap(next, others)) { setError(zh ? "和这天的另一个固定时段重叠了。" : "Overlaps another fixed slot that day."); return; }
    if (sameNonFixed(next, others) && !window.confirm(zh ? "这天已经有一条相同的安排。仍然再加一条吗？" : "That day already has an identical plan. Add another one?")) return;
    void run(async () => {
      const r = await createClient().from("todo_sessions").update(sessionColumns(next)).eq("id", item.id).eq("todo_id", todoId);
      return r.error?.message ?? "";
    }, () => setPanel(null));
  }
  function cancelItem(item: DatedItem) {
    if (!isEditable(item.day, todayISO)) return;
    if (!window.confirm(zh ? `取消 ${formatDay(item.day, true)} 的安排？任务和完成记录都不受影响。` : `Cancel the plan on ${formatDay(item.day, false)}? The task and its history stay.`)) return;
    void run(async () => {
      const r = await createClient().from("todo_sessions").delete().eq("id", item.id).eq("todo_id", todoId);
      return r.error?.message ?? "";
    }, () => setPicked((ids) => ids.filter((x) => x !== item.id)));
  }

  // ---------- multi-select time change (atomic, B08) ----------
  const futureFixed = upcoming.filter((r) => r.mode === "fixed");
  function saveBulk() {
    if (!validTime(bulkStart) || !validTime(bulkEnd) || bulkEnd <= bulkStart) { setError(zh ? "请填写有效的开始和结束时间。" : "Enter a valid time range."); return; }
    const chosen = futureFixed.filter((r) => picked.includes(r.id));
    if (!chosen.length) return;
    const others = rows.filter((r) => !picked.includes(r.id));
    if (chosen.some((c) => fixedOverlap({ ...c, start: bulkStart, end: bulkEnd }, others))) { setError(zh ? "新时间和某天的其他安排重叠了。" : "The new time overlaps another plan."); return; }
    void run(async () => {
      // One upsert statement: either every selected plan moves or none does.
      const r = await createClient().from("todo_sessions").upsert(
        chosen.map((c) => ({ id: c.id, todo_id: todoId, mode: "fixed", scheduled_start: toIso(c.day, bulkStart), scheduled_end: toIso(c.day, bulkEnd) })),
        { onConflict: "id" });
      return r.error?.message ?? "";
    }, () => { setMulti(false); setPicked([]); });
  }

  // ---------- copy ----------
  function openCopy(source: DatedItem) {
    setCopyChoice(!pattern && projectEnd ? "weekdays" : pattern && !isFlexibleQuota ? "all" : "dates");
    setCopyDays([]); setFollowUp(null); setContinuation(null);
    setPanel({ kind: "copy", source });
  }
  const copySource = panel?.kind === "copy" ? panel.source : null;
  const copyLimit = copySource ? (pattern ? periodEnd(copySource.day) : projectEnd ?? addDaysISO(copySource.day, 27)) : todayISO;
  const copyCandidates = useMemo(() => {
    if (!copySource) return [] as string[];
    const out: string[] = [];
    for (let d = addDaysISO(copySource.day, 1); d <= copyLimit && out.length < 120; d = addDaysISO(d, 1)) if (d >= todayISO && ruleDay(d)) out.push(d);
    return out;
  }, [copySource, copyLimit, todayISO, pattern]);
  const blockedDays = copySource ? copyCandidates.filter((d) => fixedOverlap({ ...copySource, day: d }, rows)) : [];
  const duplicateDays = copySource ? copyCandidates.filter((d) => sameNonFixed({ ...copySource, day: d }, rows)) : [];
  const freeCandidates = copyCandidates.filter((d) => !blockedDays.includes(d));
  const quotaLeft = isFlexibleQuota && pattern && copySource
    ? remainingQuota(pattern.target_count, rows.filter((r) => r.day >= periodStart(copySource.day) && r.day <= periodEnd(copySource.day)).length)
    : Infinity;
  const copySelected = copyChoice === "dates" ? copyDays : copyChoice === "weekdays" ? freeCandidates.filter((d) => weekdayISO(d) <= 5) : freeCandidates;

  function applyCopy() {
    if (!copySource || !copySelected.length) return;
    const target = copySelected.filter((d) => !blockedDays.includes(d)).slice(0, quotaLeft);
    const dupCount = target.filter((d) => duplicateDays.includes(d)).length;
    if (dupCount && !window.confirm(zh ? `其中 ${dupCount} 天已经有一条相同的安排。仍然都加上吗？` : `${dupCount} of these days already have an identical plan. Add anyway?`)) return;
    const useTemplates = !pattern && Boolean(projectEnd) && copyChoice !== "dates";
    void run(async () => {
      if (useTemplates) {
        const selectors = copyChoice === "weekdays"
          ? [1, 2, 3, 4, 5].map((n) => ({ selector_kind: "weekday", selector_value: n }))
          : [{ selector_kind: "all", selector_value: null }];
        const starts = addDaysISO(copySource.day, 1);
        if (templates.some((t) => (t.ends_on === null || t.ends_on >= starts) && selectors.some((s) => s.selector_kind === t.selector_kind && s.selector_value === t.selector_value) && t.execution_mode === "fixed" && copySource.mode === "fixed" && timesOverlap(hhmm(t.start_time), hhmm(t.end_time), copySource.start, copySource.end)))
          return zh ? "这些日子已经有重叠的重复安排，请先在列表里修改它。" : "An overlapping repeating plan already covers these days.";
        // Days already holding a dated plan keep it; the series shows alongside unless times overlap (checked above for fixed).
        return insertOnce("todo_execution_templates", selectors.map((s) => ({
          todo_id: todoId, starts_on: starts, ends_on: projectEnd, timezone, ...s, execution_mode: copySource.mode, replaces_slot_key: null,
          start_time: copySource.mode === "fixed" ? copySource.start : null, end_time: copySource.mode === "fixed" ? copySource.end : null,
          window_start: copySource.mode === "window" ? copySource.start : null, window_end: copySource.mode === "window" ? copySource.end : null,
          planned_minutes: copySource.mode === "fixed" ? null : copySource.minutes,
        })));
      }
      if (!target.length) return zh ? "所选日期都已有相同或重叠的安排。" : "Every selected day already has a matching plan.";
      return insertOnce("todo_sessions", target.map((day) => ({ todo_id: todoId, ...sessionColumns({ ...copySource, day }) })));
    }, () => {
      setPanel(null);
      setNotice(useTemplates ? (zh ? "已复制到后面的日子。" : "Copied to the following days.") : (zh ? `已复制到 ${target.length} 天。` : `Copied to ${target.length} days.`));
      if (pattern && pattern.period !== "day" && !useTemplates) setContinuation([copySource, ...target.map((day) => ({ ...copySource, id: day, day }))]);
    });
  }

  // ---------- continue into next period ----------
  const shiftPeriod = (day: string): string | null => {
    if (pattern?.period === "week") return addDaysISO(day, 7);
    const [y, m, d] = day.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    const max = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    if (d > max) return null; // a 31st never silently becomes the 30th
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  function continueNext(forever: boolean) {
    if (!pattern || !continuation) return;
    const items = continuation.map((c) => ({ ...c, target: shiftPeriod(c.day) })).filter((c): c is DatedItem & { target: string } => c.target !== null);
    if (!forever && items.some((i) => sameNonFixed({ ...i, day: i.target }, rows)) && !window.confirm(zh ? "下个周期有些日子已经有相同的安排。仍然都加上吗？" : "Some days next period already have an identical plan. Add anyway?")) return;
    void run(async () => {
      if (!items.length) return zh ? "下个周期没有对应的日期。" : "No matching dates next period.";
      if (forever) {
        const starts = items.map((i) => i.target).sort()[0];
        const records = items.map((i) => {
          const monthEnd = pattern.period === "month" && pattern.include_month_end && Number(i.day.slice(-2)) === lastDayISO(i.day) && !pattern.month_days.includes(Number(i.day.slice(-2)));
          return {
            todo_id: todoId, starts_on: starts, ends_on: projectEnd, timezone, replaces_slot_key: null,
            selector_kind: pattern.period === "week" ? "weekday" : monthEnd ? "month_end" : "month_day",
            selector_value: pattern.period === "week" ? weekdayISO(i.day) : monthEnd ? null : Number(i.day.slice(-2)),
            execution_mode: i.mode, start_time: i.mode === "fixed" ? i.start : null, end_time: i.mode === "fixed" ? i.end : null,
            window_start: i.mode === "window" ? i.start : null, window_end: i.mode === "window" ? i.end : null, planned_minutes: i.mode === "fixed" ? null : i.minutes,
          };
        });
        if (records.some((r) => templates.some((t) => t.selector_kind === r.selector_kind && t.selector_value === r.selector_value && (t.ends_on === null || t.ends_on >= starts) && t.execution_mode === r.execution_mode && (r.execution_mode !== "fixed" || timesOverlap(hhmm(t.start_time), hhmm(t.end_time), r.start_time ?? "", r.end_time ?? "")))))
          return zh ? "这些日子已经有重复安排了，请在列表里修改。" : "These days already repeat; edit that series instead.";
        return insertOnce("todo_execution_templates", records);
      }
      const free = items.filter((i) => !fixedOverlap({ ...i, day: i.target }, rows));
      if (!free.length) return zh ? "下个周期的这些日子都已有安排。" : "Those days are already planned next period.";
      return insertOnce("todo_sessions", free.map((i) => ({ todo_id: todoId, ...sessionColumns({ ...i, day: i.target }) })));
    }, () => { setContinuation(null); setNotice(forever ? (zh ? "以后每个周期都会按这些日子安排。" : "Will repeat every period.") : (zh ? "已安排到下个周期。" : "Planned for next period.")); });
  }

  // ---------- series actions ----------
  // Identity rules: a group is a batch_id (or a single slot_key before v4_11); a slot is a slot_key;
  // a version is a template id. Actions name their slots explicitly, never infer them from timing.
  const hasBatchIds = templates.some((t) => Boolean((t as ExecutionTemplateV3 & { batch_id?: string | null }).batch_id));
  const versionsOf = (slotKey: string) => templates.filter((t) => t.slot_key === slotKey).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const coveringVersion = (slotKey: string, day: string) => {
    const versions = versionsOf(slotKey);
    return versions.find((v) => v.starts_on <= day && (v.ends_on === null || v.ends_on >= day)) ?? versions.find((v) => v.starts_on > day);
  };

  function openRevise(group: TemplateGroup, slotKeys: string[]) {
    const first = group.slots.find((x) => slotKeys.includes(x.slot_key))?.current ?? group.templates[0];
    const timing = slotTiming(first);
    setDraft({ day: group.starts_on > todayISO ? group.starts_on : todayISO, mode: timing.mode, start: timing.start || "19:00", end: timing.end || "20:00", minutes: String(timing.minutes ?? 45) });
    setPanel({ kind: "revise", group, slotKeys });
  }
  function saveRevise(group: TemplateGroup, slotKeys: string[]) {
    const problem = draftError(draft, zh);
    if (problem) { setError(problem); return; }
    const effective = draft.day < todayISO ? todayISO : draft.day;
    const timing = {
      p_new_mode: draft.mode,
      p_start_time: draft.mode === "fixed" ? draft.start : null, p_end_time: draft.mode === "fixed" ? draft.end : null,
      p_window_start: draft.mode === "window" ? draft.start : null, p_window_end: draft.mode === "window" ? draft.end : null,
      p_planned_minutes: draft.mode === "fixed" ? null : Number(draft.minutes),
    };
    void run(async () => {
      const db = createClient();
      if (hasBatchIds) {
        // v4_11: one transaction for every named slot; re-running the same call is a no-op.
        const r = await db.rpc("revise_execution_batch_v4", { p_batch_id: group.key, p_slot_keys: slotKeys, p_effective_on: effective, ...timing });
        return r.error?.message ?? "";
      }
      for (const slotKey of slotKeys) {
        const version = coveringVersion(slotKey, effective);
        if (!version) continue;
        if (versionsOf(slotKey).some((v) => v.starts_on > (effective < version.starts_on ? version.starts_on : effective)))
          return zh ? "这个时段之后已经有另一次修改，请先执行数据库更新 v4_11 再改。" : "This slot already has a later revision; apply migration v4_11 first.";
        const r = await db.rpc("revise_execution_template_v3", { p_template_id: version.id, p_effective_on: effective < version.starts_on ? version.starts_on : effective, ...timing });
        if (r.error) return r.error.message;
      }
      return "";
    }, () => setPanel(null));
  }
  function stopSeries(group: TemplateGroup, slotKeys: string[]) {
    const effective = group.starts_on > todayISO ? group.starts_on : todayISO;
    const what = slotKeys.length === group.slots.length ? (zh ? "这组重复安排" : "this series") : (zh ? "这个时段" : "this slot");
    if (!window.confirm(zh ? `从 ${formatDay(effective, true)} 起停止${what}？之前的安排保留。` : `Stop ${what} from ${formatDay(effective, false)}? Earlier plans stay.`)) return;
    void run(async () => {
      const db = createClient();
      if (hasBatchIds) {
        const r = await db.rpc("stop_execution_batch_v4", { p_batch_id: group.key, p_slot_keys: slotKeys, p_effective_on: effective });
        return r.error?.message ?? "";
      }
      for (const slotKey of slotKeys) {
        for (const v of versionsOf(slotKey).filter((x) => x.ends_on === null || x.ends_on >= effective)) {
          const r = await db.rpc("stop_execution_template_future_v3", { p_template_id: v.id, p_effective_on: effective < v.starts_on ? v.starts_on : effective });
          if (r.error) return r.error.message;
        }
      }
      return "";
    });
  }
  const eligibleSlots = (group: TemplateGroup, day: string) => group.slots.filter((x) => {
    const v = coveringVersion(x.slot_key, day);
    return v && v.starts_on <= day && templateEligible(day, v as ExecutionTemplateV3, pattern ?? undefined, todoStart || undefined);
  });
  function openOverride(group: TemplateGroup) {
    const first = slotTiming(group.templates[0]);
    setOverrideDay(todayISO); setOverrideAction(first.mode === "fixed" ? "reschedule" : "cancel"); setOverrideSlot("");
    setDraft({ day: todayISO, mode: "fixed", start: first.start || "19:00", end: first.end || "20:00", minutes: "45" });
    setPanel({ kind: "override", group });
  }
  function saveOverride(group: TemplateGroup) {
    if (!validDate(overrideDay) || overrideDay < todayISO) { setError(zh ? "请选择今天或以后的日期。" : "Choose today or a later date."); return; }
    const candidates = eligibleSlots(group, overrideDay);
    const slot = candidates.length === 1 ? candidates[0] : candidates.find((x) => x.slot_key === overrideSlot);
    if (!candidates.length) { setError(zh ? "这天不在这组重复安排里。" : "That day is not part of this series."); return; }
    if (!slot) { setError(zh ? "这天有几个时段，请选一个。" : "Pick which slot to change."); return; }
    const version = coveringVersion(slot.slot_key, overrideDay)!;
    if (overrideAction === "reschedule" && version.execution_mode !== "fixed") { setError(zh ? "只有固定时段可以换时间；其他方式可以选“这天不做”。" : "Only fixed slots can be moved."); return; }
    if (overrideAction === "reschedule" && (!validTime(draft.start) || !validTime(draft.end) || draft.end <= draft.start)) { setError(zh ? "请填写有效的开始和结束时间。" : "Enter a valid time range."); return; }
    void run(async () => {
      // Identity of one occurrence = (todo_id, slot_key, occurrence_date); saving twice overwrites the same row.
      const change = overrideAction === "cancel" ? { scheduled_start: null, scheduled_end: null } : { scheduled_start: toIso(overrideDay, draft.start), scheduled_end: toIso(overrideDay, draft.end) };
      const r = await createClient().from("todo_execution_overrides").upsert(
        { todo_id: todoId, slot_key: slot.slot_key, occurrence_date: overrideDay, action: overrideAction, ...change },
        { onConflict: "todo_id,slot_key,occurrence_date" });
      return r.error?.message ?? "";
    }, () => setPanel(null));
  }

  // ---------- render ----------
  const close = () => { setPanel(null); setError(""); setRetry(null); };
  const dayChip = (day: string) => <span className="w-[92px] shrink-0 text-xs font-semibold text-ink">{formatDay(day, zh)}</span>;

  return <section className="mt-4 rounded-2xl border border-line bg-white p-4">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{zh ? "时间安排" : "Time plan"}</h3>
      <div className="flex items-center gap-2">
        {futureFixed.length > 1 && <button type="button" onClick={() => { setMulti((v) => !v); setPicked([]); }} className="rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-paper">{multi ? (zh ? "完成" : "Done") : (zh ? "多选改时间" : "Select")}</button>}
        <button type="button" onClick={() => panel?.kind === "compose" ? close() : (pattern ? setPanel({ kind: "compose" }) : openCompose())}
          className="rounded-lg border border-sage-300 px-3 py-1.5 text-xs font-medium text-sage-700">{panel?.kind === "compose" ? (zh ? "收起" : "Close") : (zh ? "＋ 安排时间" : "+ Plan time")}</button>
      </div>
    </div>

    {loading ? <p className="mt-3 text-xs text-ink-faint">{zh ? "读取中…" : "Loading…"}</p> : <div className="mt-3 space-y-1.5">
      {groups.map((g) => {
        const all = g.slots.map((x) => x.slot_key);
        const several = g.slots.length > 1;
        return <div key={g.key} className="rounded-xl border border-sage-100 bg-sage-50/60">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Repeat role="img" aria-label={zh ? "重复" : "Repeats"} className="h-4 w-4 shrink-0 text-sage-700" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{describeSelectors(g.templates, zh)} · {g.uniformTiming ? describeTiming(g.mode, g.start, g.end, g.minutes, zh) : (zh ? "每个时段时间不同" : "times vary")}</p>
              <p className="text-[11px] text-ink-soft">{formatDay(g.starts_on, zh)}{zh ? " 起" : " onward"}{g.ends_on ? (zh ? ` · 到 ${formatDay(g.ends_on, true)}` : ` · until ${formatDay(g.ends_on, false)}`) : ""}</p>
            </div>
            <RowMenu zh={zh} items={[
              { label: zh ? "只改某一天…" : "Change one day…", onClick: () => openOverride(g) },
              { label: several ? (zh ? "整组从某天起修改…" : "Change all from a date…") : (zh ? "从某天起修改…" : "Change from a date…"), onClick: () => openRevise(g, all) },
              { label: several ? (zh ? "整组停止重复" : "Stop whole series") : (zh ? "停止重复" : "Stop repeating"), onClick: () => stopSeries(g, all), danger: true },
            ]} />
          </div>
          {several && <div className="space-y-0.5 border-t border-sage-100 px-3 py-1.5">
            {g.slots.map((x) => { const t = slotTiming(x.current); return <div key={x.slot_key} className="flex items-center gap-3 py-1">
              <span className="w-[92px] shrink-0 text-xs text-ink-soft">{describeSelectors([x.current], zh)}</span>
              <ModeIcon mode={t.mode} zh={zh} />
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{describeTiming(t.mode, t.start, t.end, t.minutes, zh)}{x.later.length ? (zh ? ` · ${formatDay(x.later[0].starts_on, true)} 起有新时间` : ` · changes ${formatDay(x.later[0].starts_on, false)}`) : ""}</span>
              <RowMenu zh={zh} items={[
                { label: zh ? "只改这个时段…" : "Change this slot…", onClick: () => openRevise(g, [x.slot_key]) },
                { label: zh ? "停止这个时段" : "Stop this slot", onClick: () => stopSeries(g, [x.slot_key]), danger: true },
              ]} />
            </div>; })}
          </div>}
        </div>;
      })}

      {upcoming.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
        {multi && item.mode === "fixed" && <input type="checkbox" aria-label={zh ? "选择这条安排" : "Select plan"} checked={picked.includes(item.id)} onChange={(e) => setPicked((ids) => e.target.checked ? [...ids, item.id] : ids.filter((x) => x !== item.id))} />}
        {dayChip(item.day)}
        <ModeIcon mode={item.mode} zh={zh} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{describeTiming(item.mode, item.start, item.end, item.minutes, zh)}</span>
        {!multi && <RowMenu zh={zh} items={[
          { label: zh ? "修改" : "Edit", onClick: () => openEdit(item) },
          { label: zh ? "复制到其他日子…" : "Copy to other days…", onClick: () => openCopy(item) },
          { label: zh ? "取消这天" : "Cancel this day", onClick: () => cancelItem(item), danger: true },
        ]} />}
      </div>)}

      {!groups.length && !upcoming.length && <p className="rounded-xl bg-paper/60 px-3 py-3 text-xs text-ink-soft">{zh ? "还没有安排，随时都可以加。" : "Nothing planned yet."}</p>}

      {past.length > 0 && <details className="pt-1">
        <summary className="cursor-pointer text-xs text-ink-soft">{zh ? `过去的安排（${past.length}）` : `Past plans (${past.length})`}</summary>
        <div className="mt-1.5 space-y-1">
          {past.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-ink-soft">
            {dayChip(item.day)}<ModeIcon mode={item.mode} zh={zh} /><span className="text-xs">{describeTiming(item.mode, item.start, item.end, item.minutes, zh)}</span>
          </div>)}
        </div>
      </details>}
    </div>}

    {multi && picked.length > 0 && <div className="mt-3 space-y-2 rounded-xl border border-sage-200 bg-sage-50/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">{zh ? "开始" : "Start"}<AppTimePicker value={bulkStart} onChange={setBulkStart} /></label>
        <label className="text-xs text-ink-soft">{zh ? "结束" : "End"}<AppTimePicker value={bulkEnd} onChange={setBulkEnd} /></label>
      </div>
      <button type="button" disabled={busy} className="btn-primary w-full" onClick={saveBulk}>{zh ? `把这 ${picked.length} 天改到这个时间` : `Move ${picked.length} plans to this time`}</button>
    </div>}

    {followUp && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sage-50 px-3 py-2.5 text-sm text-sage-700">
      <span className="flex-1">{zh ? `已排好 ${formatDay(followUp.day, true)}。后面也这样吗？` : `Planned for ${formatDay(followUp.day, false)}. Same on other days?`}</span>
      <button type="button" className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 text-xs" onClick={() => { const saved = rows.find((r) => r.day === followUp.day && r.mode === followUp.mode && r.start === followUp.start); if (saved) openCopy(saved); }}>{zh ? "选日子" : "Pick days"}</button>
      <button type="button" className="px-2 py-1.5 text-xs text-ink-soft" onClick={() => setFollowUp(null)}>{zh ? "不用" : "No thanks"}</button>
    </div>}

    {continuation && pattern && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sage-50 px-3 py-2.5 text-sm text-sage-700">
      <span className="flex-1">{pattern.period === "week" ? (zh ? "下周也这样？" : "Same next week?") : (zh ? "下个月也这样？" : "Same next month?")}</span>
      <button type="button" disabled={busy} className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 text-xs" onClick={() => continueNext(false)}>{pattern.period === "week" ? (zh ? "沿用到下周" : "Next week") : (zh ? "沿用到下个月" : "Next month")}</button>
      <button type="button" disabled={busy} className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 text-xs" onClick={() => continueNext(true)}>{pattern.period === "week" ? (zh ? "以后每周都这样" : "Every week") : (zh ? "以后每月都这样" : "Every month")}</button>
      <button type="button" className="px-2 py-1.5 text-xs text-ink-soft" onClick={() => setContinuation(null)}>{zh ? "再说" : "Later"}</button>
    </div>}

    {panel?.kind === "compose" && pattern && <div className="mt-4 border-t border-line pt-4">
      <RoutinePlanComposer todoId={todoId} pattern={pattern} today={todayISO} startDate={todoStart || todayISO} existing={rows} zh={zh}
        onSaved={async () => { await refresh(); router.refresh(); setPanel(null); }} />
    </div>}

    {panel?.kind === "compose" && !pattern && <div className="mt-4 space-y-3 border-t border-line pt-4">
      <DraftFields draft={draft} setDraft={setDraft} zh={zh} />
      <button type="button" disabled={busy} className="btn-primary w-full" onClick={saveOnce}>{busy ? (zh ? "保存中…" : "Saving…") : (zh ? "保存" : "Save")}</button>
    </div>}

    {panel?.kind === "edit" && <div className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink">{zh ? `修改 ${formatDay(panel.item.day, true)} 的安排` : `Edit ${formatDay(panel.item.day, false)}`}</p>
      <DraftFields draft={draft} setDraft={setDraft} zh={zh} />
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-lg border border-line py-2.5 text-sm" onClick={close}>{zh ? "取消" : "Cancel"}</button>
        <button type="button" disabled={busy} className="btn-primary flex-[2]" onClick={() => saveEdit(panel.item)}>{zh ? "保存修改" : "Save"}</button>
      </div>
    </div>}

    {panel?.kind === "copy" && copySource && <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{zh ? "复制到其他日子" : "Copy to other days"}</p>
        <button type="button" className="text-xs text-ink-soft" onClick={close}>{zh ? "关闭" : "Close"}</button>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-soft"><ModeIcon mode={copySource.mode} zh={zh} />{formatDay(copySource.day, zh)} · {describeTiming(copySource.mode, copySource.start, copySource.end, copySource.minutes, zh)}</p>
      <div className="flex flex-wrap gap-2">
        {!pattern && projectEnd && <>
          <button type="button" aria-pressed={copyChoice === "weekdays"} onClick={() => setCopyChoice("weekdays")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice === "weekdays" ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line"}`}>{zh ? `剩下的工作日（${freeCandidates.filter((d) => weekdayISO(d) <= 5).length} 天）` : `Remaining weekdays (${freeCandidates.filter((d) => weekdayISO(d) <= 5).length})`}</button>
          <button type="button" aria-pressed={copyChoice === "all"} onClick={() => setCopyChoice("all")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice === "all" ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line"}`}>{zh ? `剩下每天（${freeCandidates.length} 天）` : `Every remaining day (${freeCandidates.length})`}</button>
        </>}
        {pattern && !isFlexibleQuota && <button type="button" aria-pressed={copyChoice === "all"} onClick={() => setCopyChoice("all")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice === "all" ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line"}`}>{pattern.period === "month" ? (zh ? `本月其余规则日（${freeCandidates.length} 天）` : `Rest of this month's days (${freeCandidates.length})`) : (zh ? `本周其余规则日（${freeCandidates.length} 天）` : `Rest of this week's days (${freeCandidates.length})`)}</button>}
        <button type="button" aria-pressed={copyChoice === "dates"} onClick={() => setCopyChoice("dates")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice === "dates" ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line"}`}>{zh ? "自己选" : "Pick days"}</button>
      </div>
      {isFlexibleQuota && pattern && <p className="text-xs text-sage-700">{zh ? `本${pattern.period === "week" ? "周" : "月"}目标 ${pattern.target_count} 次，还能再排 ${quotaLeft} 天` : `Goal ${pattern.target_count} this period · ${quotaLeft} more can be planned`}</p>}
      <CopyDateCalendar start={copySource.day} end={copyLimit} today={todayISO} deadline={projectEnd ?? undefined}
        selected={copySelected} booked={rows.map((r) => r.day)} blocked={blockedDays}
        eligible={(d) => ruleDay(d) && (copyChoice !== "weekdays" || weekdayISO(d) <= 5)}
        limitReached={copyChoice === "dates" && copyDays.length >= quotaLeft}
        onToggle={(d) => { setCopyChoice("dates"); setCopyDays((old) => old.includes(d) ? old.filter((x) => x !== d) : old.length >= quotaLeft ? old : [...old, d]); }} zh={zh} />
      <button type="button" disabled={busy || copySelected.length === 0} className="btn-primary w-full" onClick={applyCopy}>
        {busy ? (zh ? "复制中…" : "Copying…") : (zh ? `复制到 ${Math.min(copySelected.length, quotaLeft)} 天` : `Copy to ${Math.min(copySelected.length, quotaLeft)} days`)}
      </button>
    </div>}

    {panel?.kind === "revise" && <div className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink">{zh ? `修改「${describeSelectors(panel.group.templates.filter((t) => panel.slotKeys.includes(t.slot_key)), true)}」` : `Change "${describeSelectors(panel.group.templates.filter((t) => panel.slotKeys.includes(t.slot_key)), false)}"`}</p>
      <label className="block text-xs text-ink-soft">{zh ? "从哪天起" : "From"}<AppDatePicker value={draft.day} onChange={(v) => setDraft({ ...draft, day: v })} /></label>
      <DraftFields draft={draft} setDraft={setDraft} zh={zh} showDate={false} />
      <p className="text-[11px] text-ink-soft">{zh ? "这天之前的安排保持不变。" : "Earlier days stay as they were."}</p>
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-lg border border-line py-2.5 text-sm" onClick={close}>{zh ? "取消" : "Cancel"}</button>
        <button type="button" disabled={busy} className="btn-primary flex-[2]" onClick={() => saveRevise(panel.group, panel.slotKeys)}>{zh ? "保存" : "Save"}</button>
      </div>
    </div>}

    {panel?.kind === "override" && <div className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink">{zh ? "只改某一天" : "Change one day"}</p>
      <label className="block text-xs text-ink-soft">{zh ? "哪天" : "Which day"}<AppDatePicker value={overrideDay} onChange={setOverrideDay} /></label>
      {eligibleSlots(panel.group, overrideDay).length > 1 && <div className="flex flex-wrap gap-2">
        {eligibleSlots(panel.group, overrideDay).map((x) => { const v = coveringVersion(x.slot_key, overrideDay)!; const t = slotTiming(v); return <button key={x.slot_key} type="button" aria-pressed={overrideSlot === x.slot_key} onClick={() => setOverrideSlot(x.slot_key)}
          className={`rounded-lg border px-3 py-2 text-xs ${overrideSlot === x.slot_key ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line"}`}>{describeTiming(t.mode, t.start, t.end, t.minutes, zh)}</button>; })}
      </div>}
      <div className="grid grid-cols-2 gap-2">
        {panel.group.templates.some((t) => t.execution_mode === "fixed") && <button type="button" aria-pressed={overrideAction === "reschedule"} onClick={() => setOverrideAction("reschedule")} className={`rounded-lg border p-2.5 text-xs ${overrideAction === "reschedule" ? "border-sage-500 bg-sage-50" : "border-line"}`}>{zh ? "这天换个时间" : "New time that day"}</button>}
        <button type="button" aria-pressed={overrideAction === "cancel"} onClick={() => setOverrideAction("cancel")} className={`rounded-lg border p-2.5 text-xs ${overrideAction === "cancel" ? "border-sage-500 bg-sage-50" : "border-line"}`}>{zh ? "这天不做" : "Skip that day"}</button>
      </div>
      {overrideAction === "reschedule" && <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">{zh ? "开始" : "Start"}<AppTimePicker value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} /></label>
        <label className="text-xs text-ink-soft">{zh ? "结束" : "End"}<AppTimePicker value={draft.end} onChange={(v) => setDraft({ ...draft, end: v })} /></label>
      </div>}
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-lg border border-line py-2.5 text-sm" onClick={close}>{zh ? "取消" : "Cancel"}</button>
        <button type="button" disabled={busy} className="btn-primary flex-[2]" onClick={() => saveOverride(panel.group)}>{zh ? "只保存这一天" : "Save this day"}</button>
      </div>
    </div>}

    {notice && <p role="status" className="mt-3 text-xs text-sage-700">{notice}</p>}
    {error && <div role="alert" className="mt-3 flex items-center gap-3 rounded-xl bg-blush-50 px-3 py-2 text-xs text-blush-500">
      <span className="flex-1">{error}</span>
      {retry && <button type="button" disabled={busy} className="rounded-lg border border-blush-100 bg-white px-3 py-1.5" onClick={retry}>{zh ? "重试" : "Retry"}</button>}
    </div>}
  </section>;
}
