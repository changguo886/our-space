// AI task draft: JSON schema, prompt and normalization.
// Pure module (no Next/Supabase imports) so it can run under `npm test`.
//
// The model only proposes a draft. normalizeDraft() reshapes whatever it
// returns so that it always satisfies the live database constraints
// (todos_*, habit_patterns_v3_consistent, todo_subtasks_*); anything it had
// to change is reported in `notes` instead of failing the request.

export type TaskKind = "one_time" | "project" | "routine";
export type Category = "work" | "study" | "life" | "rest" | "other";
export type RoutinePeriod = "day" | "week" | "month";

export type DraftStep = { title: string; estimated_minutes: number | null };

export type TaskDraft = {
  task_type: TaskKind;
  title: string;
  description: string;
  category: Category | null;
  task_date: string | null;
  plan_start_date: string | null;
  target_finish_date: string | null;
  deadline_date: string | null;
  routine_period: RoutinePeriod | null;
  routine_arrangement: "fixed" | "flexible" | null;
  routine_target_count: number | null;
  routine_weekdays: number[];
  steps: DraftStep[];
  notes: string[];
};

export const KINDS: TaskKind[] = ["one_time", "project", "routine"];
export const CATEGORIES: Category[] = ["work", "study", "life", "rest", "other"];
export const MAX_STEPS = 12;
export const MAX_TITLE = 160;

const nullable = (type: string) => ({ type: [type, "null"] });

export const TASK_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    task_type: { type: "string", enum: KINDS },
    title: { type: "string" },
    description: { type: "string" },
    category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
    task_date: nullable("string"),
    plan_start_date: nullable("string"),
    target_finish_date: nullable("string"),
    deadline_date: nullable("string"),
    routine_period: { type: ["string", "null"], enum: ["day", "week", "month", null] },
    routine_arrangement: { type: ["string", "null"], enum: ["fixed", "flexible", null] },
    routine_target_count: nullable("integer"),
    routine_weekdays: { type: "array", items: { type: "integer" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, estimated_minutes: nullable("integer") },
        required: ["title", "estimated_minutes"],
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "task_type", "title", "description", "category", "task_date", "plan_start_date",
    "target_finish_date", "deadline_date", "routine_period", "routine_arrangement",
    "routine_target_count", "routine_weekdays", "steps", "notes",
  ],
} as const;

export function buildInstructions(today: string, timezone: string, weekday: string): string {
  return `You turn one natural-language description into ONE task draft for the planning app Our Space.
Today is ${today} (${weekday}), timezone ${timezone}. Resolve relative dates ("下周五", "this weekend") against today. Dates are ISO YYYY-MM-DD.
Write title, description, steps and notes in the user's language. You never save anything.

Task type:
- one_time: a single result done once (买牛奶, 交报销单). task_date only if the user names a day, else null.
- project: a finite outcome needing several sessions (写完论文第三章). plan_start_date defaults to today. target_finish_date only if stated or clearly implied, else null. deadline_date only for an external hard deadline.
- routine: something repeated on a schedule (每周跑步三次, 每周五写周报). routine_period day/week/month. Fixed weekdays (ISO 1=Mon..7=Sun) only for period week, and then target_count = number of weekdays. Otherwise arrangement flexible with a target_count. routine has no steps.

Steps (the important part):
- project: 3–8 steps; one_time: 0–4 steps, only if it genuinely has parts.
- Each step is one concrete action starting with a verb, doable in one sitting (15–120 minutes), in execution order.
- No filler steps like "开始", "收尾", "检查一下". Do not repeat the title as a step.
- estimated_minutes: a realistic integer, or null if you cannot tell.

Never invent dates, people or facts. Leave unknown fields null and add a short note (max 3 notes) only for things the user should decide.
category: work/study/life/rest/other, or null if unclear.

Example — "下周五前交统计分析报告" (today 2026-10-23, Fri):
task_type project, title "完成统计分析报告", plan_start_date 2026-10-23, target_finish_date 2026-10-30, category study,
steps: "整理并清洗数据" 90, "做描述性统计和图表" 60, "拟合主要模型并检查假设" 120, "撰写结果与讨论部分" 120, "通读修改并导出提交" 45.`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(x: unknown): x is string {
  if (typeof x !== "string" || !ISO.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const dateOrNull = (x: unknown) => (validDate(x) ? x : null);
const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const clampInt = (x: unknown, min: number, max: number, fallback: number) =>
  typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : fallback;

/** Throws only when there is nothing usable (no title). Everything else is repaired. */
export function normalizeDraft(raw: unknown, today: string, zh: boolean): TaskDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const notes = Array.isArray(r.notes) ? r.notes.map(n => text(n, 200)).filter(Boolean).slice(0, 3) : [];
  const fix = (zhText: string, enText: string) => notes.push(zh ? zhText : enText);

  const title = text(r.title, MAX_TITLE);
  if (!title) throw new Error("empty title");
  const task_type: TaskKind = KINDS.includes(r.task_type as TaskKind) ? (r.task_type as TaskKind) : "one_time";
  const category = CATEGORIES.includes(r.category as Category) ? (r.category as Category) : null;

  const draft: TaskDraft = {
    task_type, title, category,
    description: text(r.description, 2000),
    task_date: null, plan_start_date: null, target_finish_date: null, deadline_date: null,
    routine_period: null, routine_arrangement: null, routine_target_count: null, routine_weekdays: [],
    steps: [], notes,
  };

  if (task_type === "one_time") {
    draft.task_date = dateOrNull(r.task_date);
  } else if (task_type === "project") {
    const start = dateOrNull(r.plan_start_date) ?? today;
    let finish = dateOrNull(r.target_finish_date);
    let deadline = dateOrNull(r.deadline_date);
    if (finish && finish < start) { finish = null; fix("目标完成日早于开始日，已清空，请重新选择。", "Target finish was before the start and was cleared."); }
    if (deadline && finish && deadline < finish) { deadline = null; fix("截止日早于目标完成日，已清空。", "Deadline was before target finish and was cleared."); }
    if (!finish) fix("请选择目标完成日期。", "Choose a target finish date.");
    Object.assign(draft, { plan_start_date: start, target_finish_date: finish, deadline_date: deadline });
  } else {
    // Mirror habit_patterns_v3_consistent.
    const period: RoutinePeriod = ["day", "week", "month"].includes(r.routine_period as string) ? (r.routine_period as RoutinePeriod) : "week";
    const weekdays = Array.isArray(r.routine_weekdays)
      ? [...new Set(r.routine_weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7))].sort((a, b) => a - b)
      : [];
    let arrangement: "fixed" | "flexible" = r.routine_arrangement === "fixed" ? "fixed" : "flexible";
    if (arrangement === "fixed" && (period !== "week" || weekdays.length === 0)) {
      arrangement = "flexible";
      if (period === "month") fix("每月固定日期请在表单中选择。", "Pick fixed monthly dates in the form.");
    }
    draft.routine_period = period;
    draft.routine_arrangement = arrangement;
    draft.routine_weekdays = arrangement === "fixed" ? weekdays : [];
    draft.routine_target_count = arrangement === "fixed"
      ? weekdays.length
      : clampInt(r.routine_target_count, 1, period === "day" ? 24 : period === "week" ? 7 : 31, period === "day" ? 1 : 3);
  }

  if (task_type !== "routine" && Array.isArray(r.steps)) {
    const seen = new Set<string>();
    for (const s of r.steps) {
      const step = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const stepTitle = text(step.title, MAX_TITLE);
      if (!stepTitle || seen.has(stepTitle) || stepTitle === title) continue;
      seen.add(stepTitle);
      const minutes = typeof step.estimated_minutes === "number" && Number.isFinite(step.estimated_minutes) && step.estimated_minutes > 0
        ? Math.min(600, Math.max(5, Math.round(step.estimated_minutes))) : null;
      draft.steps.push({ title: stepTitle, estimated_minutes: minutes });
      if (draft.steps.length >= MAX_STEPS) break;
    }
  }
  return draft;
}
