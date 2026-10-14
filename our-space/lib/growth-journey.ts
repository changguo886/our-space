// Growth Journey (issue 14): pure calculations for one project's journey.
// No imports, so it can be unit tested with `node --test` (tests/growth-journey.test.mjs).
//
// Concepts
// - The road runs from the project start to its final deadline
//   (deadline_date, else target_finish_date). target_finish_date is shown as a goal marker.
// - The cat stands on TODAY. Its pose reflects what happened today.
// - The coloured part of the road shows how much WORK is done:
//   completed steps / all steps, or (with no steps) active days / total days.
//   Coloured part ahead of the cat = ahead of schedule; behind = catching up.
// - A step whose execution plan has a date is a milestone (star) on that date.
// - Every day a step is completed gets a flower.

export type CatPose =
  | "walk" | "run" | "read" | "laptop" | "listen" | "cheer" | "flag" | "nap" | "sleep"
  | "umbrella" | "love" | "butterfly" | "garden" | "drink";

export type JourneyProject = {
  id: string;
  title: string;
  status: string; // pending | running | paused | completed
  category: string | null;
  task_date: string | null;
  plan_start_date: string | null;
  target_finish_date: string | null;
  deadline_date: string | null;
  completed_at: string | null; // ISO timestamp
};

export type JourneyStep = { id: string; title: string; completed: boolean; completed_day: string | null };
/** One execution plan: its local day and (optionally) the step it belongs to. */
export type JourneyPlan = { day: string; subtask_id: string | null };

export type JourneyInput = {
  project: JourneyProject;
  steps: JourneyStep[];
  plans: JourneyPlan[];
  /** Local days with focus time on this project. */
  focusDays: string[];
  /** Local days marked as rest on the journey. */
  restDays: string[];
  today: string;
  /** Local hour 0–23, used for the night pose. */
  hour: number;
};

export type Milestone = { day: string; title: string; done: boolean; stepId: string };

export type JourneyModel = {
  start: string;
  end: string;
  target: string | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  activeDays: number;
  /** 0–1: share of work done. */
  progress: number;
  /** Last day of the coloured road (null when nothing is done yet). */
  fillDay: string | null;
  /** Where the work stands relative to today. */
  pace: "ahead" | "on_track" | "behind" | "not_started" | "done";
  milestones: Milestone[];
  stepsDone: number;
  stepsTotal: number;
  flowerDays: string[];
  plannedDays: string[];
  pose: CatPose;
  message: string;
  tip: string;
};

export function dayDiff(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function addDays(day: string, amount: number): string {
  const v = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + amount));
  return v.toISOString().slice(0, 10);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic pick so a day always shows the same scenery / idle pose. */
export function pick<T>(seed: string, items: readonly T[]): T {
  return items[hash(seed) % items.length];
}

export function focusPose(category: string | null): CatPose {
  if (category === "study") return "read";
  if (category === "work") return "laptop";
  return "listen";
}

const md = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;

export function buildJourney(input: JourneyInput): JourneyModel {
  const { project, steps, plans, focusDays, restDays, today, hour } = input;
  const start = project.plan_start_date ?? project.task_date ?? today;
  const target = project.target_finish_date;
  let end = project.deadline_date ?? target ?? start;
  if (end < start) end = start;
  const totalDays = dayDiff(start, end) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, dayDiff(start, today) + 1));
  const remainingDays = Math.max(0, dayDiff(today, end));

  // Milestones: a step with a dated plan sits on its latest plan day.
  const stepDay = new Map<string, string>();
  for (const plan of plans) {
    if (!plan.subtask_id) continue;
    const prev = stepDay.get(plan.subtask_id);
    if (!prev || plan.day > prev) stepDay.set(plan.subtask_id, plan.day);
  }
  const milestones: Milestone[] = steps
    .filter((s) => stepDay.has(s.id))
    .map((s) => ({ day: stepDay.get(s.id)!, title: s.title, done: s.completed, stepId: s.id }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const doneDays = steps.filter((s) => s.completed && s.completed_day).map((s) => s.completed_day!);
  const flowerDays = [...new Set(doneDays)].sort();
  const inRange = (d: string) => d >= start && d <= today;
  const activeDays = new Set([...focusDays, ...doneDays].filter(inRange)).size;

  const stepsTotal = steps.length;
  const stepsDone = steps.filter((s) => s.completed).length;
  const finished = project.status === "completed";
  const progress = finished
    ? 1
    : stepsTotal > 0
      ? stepsDone / stepsTotal
      : totalDays > 0 ? Math.min(1, activeDays / totalDays) : 0;
  const fillDay = progress <= 0 ? null : addDays(start, Math.max(0, Math.round(progress * totalDays) - 1));

  const expected = totalDays > 0 ? elapsedDays / totalDays : 0;
  const pace: JourneyModel["pace"] = finished
    ? "done"
    : progress === 0 && today < start
      ? "not_started"
      : progress >= expected + 0.05
        ? "ahead"
        : progress + 0.1 < expected
          ? "behind"
          : "on_track";

  // ----- today's pose (first match wins) -----
  const plannedDays = [...new Set(plans.map((p) => p.day))].sort();
  const stepsToday = steps.filter((s) => s.completed && s.completed_day === today);
  const milestoneToday = milestones.some((m) => m.done && stepsToday.some((s) => s.id === m.stepId));
  const focusedToday = focusDays.includes(today);
  const yesterday = addDays(today, -1);
  const missedYesterday =
    plannedDays.includes(yesterday) && !focusDays.includes(yesterday) && !doneDays.includes(yesterday);

  let pose: CatPose;
  let message: string;
  if (finished) {
    pose = "love";
    message = "我们走到终点啦！\n这一路的每一步，都算数。";
  } else if (project.status === "running") {
    pose = focusPose(project.category);
    message = "正在专注中，\n我在旁边安静陪着你。";
  } else if (restDays.includes(today)) {
    pose = "nap";
    message = "今天是休息日，\n好好充电，明天再出发。";
  } else if (milestoneToday) {
    pose = "flag";
    message = "到达一个阶段目标啦！\n插上小旗子纪念一下。";
  } else if (stepsToday.length > 0) {
    pose = "cheer";
    message = `今天完成了 ${stepsToday.length} 个步骤，\n真棒！`;
  } else if (focusedToday) {
    pose = "run";
    message = "今天已经在前进了，\n继续保持这个节奏。";
  } else if (hour >= 22) {
    pose = "sleep";
    message = "夜深了，\n明天我们再一起走。";
  } else if (today < start) {
    pose = "walk";
    message = `旅程将在 ${md(start)} 出发，\n我已经准备好背包啦。`;
  } else if (missedYesterday) {
    pose = "umbrella";
    message = "昨天下了点小雨也没关系，\n今天继续就好。";
  } else if (!plannedDays.includes(today)) {
    pose = pick(today + project.id, ["butterfly", "garden", "drink"] as const);
    message = "今天没有安排，\n随意走走也很好。";
  } else {
    pose = "walk";
    message = elapsedDays > 0
      ? `继续加油！\n你已经走了 ${elapsedDays} 天啦。`
      : "出发吧！";
  }

  const goalDay = target ?? end;
  const tip =
    pace === "done"
      ? "这个项目已经完成，可以回顾一下走过的路。"
      : pace === "behind"
        ? `进度稍微落后一点，挑一个最小的步骤先做完吧。`
        : pace === "ahead"
          ? `进度超前了！保持节奏，${md(goalDay)} 会很从容。`
          : pace === "not_started"
            ? `${md(start)} 出发，先把第一步写进步骤里吧。`
            : `保持每天的小进步，就能在 ${md(goalDay)} 看到闪闪发光的成果！`;

  return {
    start, end, target, totalDays, elapsedDays, remainingDays, activeDays, progress, fillDay, pace,
    milestones, stepsDone, stepsTotal, flowerDays, plannedDays, pose, message, tip,
  };
}

/** Monday-first weeks covering the given month (YYYY-MM). */
export function monthWeeks(month: string): string[][] {
  const first = month + "-01";
  const weekday = (new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)).getUTCDay() + 6) % 7;
  let day = addDays(first, -weekday);
  const weeks: string[][] = [];
  do {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i));
    weeks.push(week);
    day = addDays(day, 7);
  } while (day.slice(0, 7) === month);
  return weeks;
}
