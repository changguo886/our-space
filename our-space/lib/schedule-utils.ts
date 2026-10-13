// Pure helpers for the execution-schedule UI. No imports, so they can be unit
// tested with `node --test` (see tests/schedule-utils.test.mjs).

export type ScheduleMode = "fixed" | "window" | "flexible";

/** One dated plan as shown in the schedule list (fixed session or flexible/window plan). */
export type DatedItem = {
  id: string;
  day: string;            // YYYY-MM-DD in the viewer's local calendar
  mode: ScheduleMode;
  start: string;          // HH:mm (fixed / window), "" for flexible
  end: string;            // HH:mm (fixed / window), "" for flexible
  minutes: number;
};

export type TemplateLike = {
  id: string;
  /** One repeating time slot; every revision of that slot keeps the same slot_key. */
  slot_key: string;
  /** All slots created by one save share a batch_id (NULL before migration v4_11). */
  batch_id?: string | null;
  starts_on: string;
  ends_on: string | null;
  execution_mode: ScheduleMode;
  selector_kind: "all" | "weekday" | "month_day" | "month_end";
  selector_value: number | null;
  start_time: string | null;
  end_time: string | null;
  window_start: string | null;
  window_end: string | null;
  planned_minutes: number | null;
};

export type SlotView = {
  slot_key: string;
  /** Version in effect today (or the next one, if the slot starts later). */
  current: TemplateLike;
  /** Later revisions already scheduled for this slot. */
  later: TemplateLike[];
};

export type TemplateGroup = {
  /** batch_id when present, otherwise the slot_key: never inferred from timing or timestamps. */
  key: string;
  slots: SlotView[];
  /** All current versions (one per slot), for labels and selector descriptions. */
  templates: TemplateLike[];
  /** True when every slot shares the same mode and times, so one timing line describes the group. */
  uniformTiming: boolean;
  mode: ScheduleMode;
  start: string;
  end: string;
  minutes: number | null;
  starts_on: string;
  ends_on: string | null;
};

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** "10月14日 周三" / "Wed, Oct 14". */
export function formatDay(day: string, zh: boolean): string {
  const [, m, d] = day.split("-").map(Number);
  const w = isoWeekday(day) - 1;
  return zh ? `${m}月${d}日 周${WEEKDAYS_ZH[w]}` : `${WEEKDAYS_EN[w]}, ${MONTHS_EN[m - 1]} ${d}`;
}

export function hhmm(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

function toMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** Half-open interval overlap on the same day, HH:mm strings. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/**
 * Hard rule (blocks saving): two FIXED slots of the same task on the same day may not overlap.
 * Window and flexible plans never block: they describe intent, not exclusive time.
 */
export function fixedOverlap(candidate: Omit<DatedItem, "id">, existing: Omit<DatedItem, "id">[]): boolean {
  if (candidate.mode !== "fixed") return false;
  return existing.some((o) => o.day === candidate.day && o.mode === "fixed" && timesOverlap(candidate.start, candidate.end, o.start, o.end));
}

/**
 * Soft rule (warn, then allow): a window/flexible plan identical to one already on that day.
 * It may be intentional independent work, so the user decides. Retried requests are handled
 * separately by client-generated ids, not by comparing content.
 */
export function sameNonFixed(candidate: Omit<DatedItem, "id">, existing: Omit<DatedItem, "id">[]): boolean {
  if (candidate.mode === "fixed") return false;
  return existing.some((o) => o.day === candidate.day && o.mode === candidate.mode && o.minutes === candidate.minutes
    && (candidate.mode === "flexible" || (o.start === candidate.start && o.end === candidate.end)));
}

/** Chronological order: earlier day first, then earlier start time; flexible plans sort before timed ones. */
export function sortDated<T extends DatedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.day.localeCompare(b.day) || (a.start || "").localeCompare(b.start || "") || a.id.localeCompare(b.id));
}

/** Upcoming items (today and later) ascending, and past items newest first. */
export function splitByToday<T extends DatedItem>(items: T[], today: string): { upcoming: T[]; past: T[] } {
  const sorted = sortDated(items);
  return { upcoming: sorted.filter((x) => x.day >= today), past: sorted.filter((x) => x.day < today).reverse() };
}

/** A dated plan may be edited or cancelled only if its ORIGINAL day is today or later. */
export function isEditable(originalDay: string, today: string): boolean {
  return originalDay >= today;
}

function selectorOrder(t: TemplateLike): number {
  if (t.selector_kind === "all") return 0;
  if (t.selector_kind === "month_end") return 100;
  return t.selector_value ?? 0;
}

function timingKey(t: TemplateLike): string {
  return [t.execution_mode, hhmm(t.start_time), hhmm(t.end_time), hhmm(t.window_start), hhmm(t.window_end), t.execution_mode === "fixed" ? "" : String(t.planned_minutes ?? "")].join("|");
}

/**
 * Groups repeating slots for display by explicit identity only:
 * batch_id (one save) when available, otherwise each slot_key on its own.
 * Two independent series with identical timing therefore never merge.
 * Versions that ended before `today` are hidden.
 */
export function groupTemplates(templates: TemplateLike[], today: string): TemplateGroup[] {
  const active = templates.filter((t) => t.ends_on === null || t.ends_on >= today);
  const bySlot = new Map<string, TemplateLike[]>();
  for (const t of active) bySlot.set(t.slot_key, [...(bySlot.get(t.slot_key) ?? []), t]);
  const groups = new Map<string, SlotView[]>();
  for (const [slot_key, versions] of bySlot) {
    const sorted = [...versions].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const currentIndex = Math.max(0, sorted.findIndex((v, i) => v.starts_on <= today && (i === sorted.length - 1 || sorted[i + 1].starts_on > today)));
    const view: SlotView = { slot_key, current: sorted[currentIndex], later: sorted.slice(currentIndex + 1) };
    const key = view.current.batch_id ?? slot_key;
    groups.set(key, [...(groups.get(key) ?? []), view]);
  }
  return [...groups.entries()]
    .map(([key, slots]) => {
      const ordered = [...slots].sort((a, b) => selectorOrder(a.current) - selectorOrder(b.current) || hhmm(a.current.start_time).localeCompare(hhmm(b.current.start_time)));
      const templatesNow = ordered.map((x) => x.current);
      const first = templatesNow[0];
      return {
        key,
        slots: ordered,
        templates: templatesNow,
        uniformTiming: templatesNow.every((t) => timingKey(t) === timingKey(first)),
        mode: first.execution_mode,
        start: first.execution_mode === "fixed" ? hhmm(first.start_time) : hhmm(first.window_start),
        end: first.execution_mode === "fixed" ? hhmm(first.end_time) : hhmm(first.window_end),
        minutes: first.planned_minutes,
        starts_on: templatesNow.map((t) => t.starts_on).sort()[0],
        ends_on: templatesNow.every((t) => t.ends_on) ? templatesNow.map((t) => t.ends_on as string).sort().at(-1) ?? null : null,
      };
    })
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.start.localeCompare(b.start) || a.key.localeCompare(b.key));
}

export function slotTiming(t: TemplateLike) {
  return {
    mode: t.execution_mode,
    start: t.execution_mode === "fixed" ? hhmm(t.start_time) : hhmm(t.window_start),
    end: t.execution_mode === "fixed" ? hhmm(t.end_time) : hhmm(t.window_end),
    minutes: t.planned_minutes,
  };
}

/** "每周一、三、五" / "每月 1、15 日、月末" / "每天". */
export function describeSelectors(templates: TemplateLike[], zh: boolean): string {
  if (templates.some((t) => t.selector_kind === "all")) return zh ? "每天" : "Every day";
  const weekdays = templates.filter((t) => t.selector_kind === "weekday").map((t) => t.selector_value ?? 0).sort((a, b) => a - b);
  const monthDays = templates.filter((t) => t.selector_kind === "month_day").map((t) => t.selector_value ?? 0).sort((a, b) => a - b);
  const monthEnd = templates.some((t) => t.selector_kind === "month_end");
  const parts: string[] = [];
  if (weekdays.length) {
    if (weekdays.join(",") === "1,2,3,4,5") parts.push(zh ? "每个工作日" : "Weekdays");
    else parts.push(zh ? "每周" + weekdays.map((d) => WEEKDAYS_ZH[d - 1]).join("、") : "Every " + weekdays.map((d) => WEEKDAYS_EN[d - 1]).join(", "));
  }
  if (monthDays.length || monthEnd) {
    const days = monthDays.map(String);
    if (zh) parts.push("每月 " + [...(days.length ? [days.join("、") + " 日"] : []), ...(monthEnd ? ["月末"] : [])].join("、"));
    else parts.push("Monthly on " + [...days, ...(monthEnd ? ["month end"] : [])].join(", "));
  }
  return parts.join(zh ? "；" : "; ");
}

export function describeTiming(mode: ScheduleMode, start: string, end: string, minutes: number | null, zh: boolean): string {
  if (mode === "fixed") return `${start}–${end}`;
  if (mode === "window") return zh ? `${start}–${end} 之间 · ${minutes ?? 0} 分钟` : `${start}–${end} · ${minutes ?? 0} min`;
  return zh ? `不定时 · ${minutes ?? 0} 分钟` : `Anytime · ${minutes ?? 0} min`;
}

/** How many more dates may still be planned in a flexible N-per-period routine. */
export function remainingQuota(target: number, alreadyPlanned: number): number {
  return Math.max(0, target - alreadyPlanned);
}

/** Postgres unique violation: a retried insert with the same client id already succeeded. */
export function isDuplicateKeyError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

// ---------- Routine completion periods (Phase 1) ----------

export type RoutineRule = {
  period: "day" | "week" | "month";
  arrangement: "fixed" | "flexible";
  target_count: number;
  weekdays: number[];
  month_days: number[];
  include_month_end: boolean;
};

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysInMonth(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First and last day (inclusive) of the period that contains `day`. Weeks run Monday–Sunday. */
export function periodRange(day: string, period: RoutineRule["period"]): { start: string; end: string } {
  if (period === "day") return { start: day, end: day };
  if (period === "week") { const start = addDays(day, 1 - isoWeekday(day)); return { start, end: addDays(start, 6) }; }
  return { start: day.slice(0, 8) + "01", end: day.slice(0, 8) + String(daysInMonth(day)).padStart(2, "0") };
}

/**
 * How many completions the rule asks for in the period containing `day`.
 * Fixed monthly rules count the dates that really exist that month (31st skipped in short months,
 * month end deduplicated against an explicit last day); flexible rules use target_count.
 */
export function periodTarget(rule: RoutineRule, day: string): number {
  if (rule.arrangement === "flexible" || rule.period === "day") return rule.target_count;
  if (rule.period === "week") return new Set(rule.weekdays).size;
  const last = daysInMonth(day);
  const dates = new Set(rule.month_days.filter((d) => d <= last));
  if (rule.include_month_end) dates.add(last);
  return dates.size;
}

export function periodLabel(period: RoutineRule["period"], zh: boolean): string {
  return period === "day" ? (zh ? "今天" : "Today") : period === "week" ? (zh ? "本周" : "This week") : (zh ? "本月" : "This month");
}

// ---------- Task card plan status (display only; no stored status field) ----------

export type NextPlan = { day: string; mode: ScheduleMode; start: string; end: string };

/** "今天" / "明天" / "周三" (within a week) / "10月20日". */
export function relativeDay(day: string, today: string, zh: boolean): string {
  if (day === today) return zh ? "今天" : "Today";
  if (day === addDays(today, 1)) return zh ? "明天" : "Tomorrow";
  if (day > today && day <= addDays(today, 6)) return zh ? "周" + WEEKDAYS_ZH[isoWeekday(day) - 1] : WEEKDAYS_EN[isoWeekday(day) - 1];
  const [, m, d] = day.split("-").map(Number);
  return zh ? `${m}月${d}日` : `${MONTHS_EN[m - 1]} ${d}`;
}

export type PlanStatus = { text: string; tone: "plain" | "muted" | "todo" };

/**
 * One line that tells where a task stands, derived from what already exists:
 *   one-time: 已安排 · 周三 19:00 | 今天 / 10月20日 (date only) | 待规划 (no date, no plan)
 *   routine:  下次 · 周三 19:00 | 按周期打卡 (rule active, no plan needed)
 *   project:  已安排 · … | 尚无执行计划 (secondary)
 */
export function planStatus(input: { type: string | null | undefined; taskDate: string | null | undefined; today: string; next: NextPlan | null; zh: boolean }): PlanStatus {
  const { type, taskDate, today, next, zh } = input;
  const when = next ? `${relativeDay(next.day, today, zh)}${next.mode === "fixed" ? " " + next.start : next.mode === "window" ? ` ${next.start}–${next.end}` : zh ? " 不定时" : " anytime"}` : "";
  const routine = type === "routine" || type === "habit";
  if (routine) return next ? { text: (zh ? "下次 · " : "Next · ") + when, tone: "plain" } : { text: zh ? "按周期打卡" : "Check in each period", tone: "muted" };
  if (next) return { text: (zh ? "已安排 · " : "Planned · ") + when, tone: "plain" };
  if (type === "project") return { text: zh ? "尚无执行计划" : "No plan yet", tone: "muted" };
  if (taskDate) return { text: relativeDay(taskDate, today, zh), tone: "plain" };
  return { text: zh ? "待规划" : "To plan", tone: "todo" };
}
