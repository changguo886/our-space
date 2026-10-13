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

export type TemplateGroup = {
  key: string;
  templates: TemplateLike[];
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
 * One shared conflict rule for every entry point (single save, copy, routine composer):
 * - two fixed slots on the same day conflict only if their times overlap;
 * - a window / flexible plan conflicts only with an identical plan on that day;
 * - different modes on the same day never conflict (a day may hold a fixed slot and a flexible plan).
 */
export function conflictsWith(candidate: Omit<DatedItem, "id">, existing: Omit<DatedItem, "id">[]): boolean {
  return existing.some((other) => {
    if (other.day !== candidate.day || other.mode !== candidate.mode) return false;
    if (candidate.mode === "fixed") return timesOverlap(candidate.start, candidate.end, other.start, other.end);
    if (candidate.mode === "window")
      return other.start === candidate.start && other.end === candidate.end && other.minutes === candidate.minutes;
    return other.minutes === candidate.minutes;
  });
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

function templateSignature(t: TemplateLike): string {
  return [
    t.starts_on,
    t.ends_on ?? "",
    t.execution_mode,
    hhmm(t.start_time),
    hhmm(t.end_time),
    hhmm(t.window_start),
    hhmm(t.window_end),
    t.execution_mode === "fixed" ? "" : String(t.planned_minutes ?? ""),
  ].join("|");
}

function selectorOrder(t: TemplateLike): number {
  if (t.selector_kind === "all") return 0;
  if (t.selector_kind === "month_end") return 100;
  return t.selector_value ?? 0;
}

/** Templates saved in one batch share timing and effective range; show them as one series. */
export function groupTemplates(templates: TemplateLike[]): TemplateGroup[] {
  const groups = new Map<string, TemplateLike[]>();
  for (const t of templates) {
    const key = templateSignature(t);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => selectorOrder(a) - selectorOrder(b));
      const first = sorted[0];
      return {
        key,
        templates: sorted,
        mode: first.execution_mode,
        start: first.execution_mode === "fixed" ? hhmm(first.start_time) : hhmm(first.window_start),
        end: first.execution_mode === "fixed" ? hhmm(first.end_time) : hhmm(first.window_end),
        minutes: first.planned_minutes,
        starts_on: first.starts_on,
        ends_on: first.ends_on,
      };
    })
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.start.localeCompare(b.start));
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
