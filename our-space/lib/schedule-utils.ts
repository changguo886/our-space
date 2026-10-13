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
