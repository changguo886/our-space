"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import JourneyRoadMonth from "@/components/growth/JourneyRoadMonth";
import {
  buildJourney,
  dayDiff,
  type CatPose,
  type JourneyPlan,
  type JourneyProject,
  type JourneyStep,
} from "@/lib/growth-journey";

/* eslint-disable @next/next/no-img-element */

function localDay(iso: string): string {
  const d = new Date(iso);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function shiftMonth(month: string, n: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const md = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const HOP: CatPose[] = ["cheer", "flag", "love"];
const catSrc = (pose: CatPose | "box" | "rest") => `/assets/growth/cats/${pose}.png`;

type Detail = { steps: JourneyStep[]; plans: JourneyPlan[]; focusDays: string[]; restDays: string[] };

export default function GrowthJourney({
  today,
  initialProjectId,
  onProjectChange,
}: {
  today: string;
  initialProjectId?: string;
  onProjectChange?: (todoId: string) => void;
}) {
  const [projects, setProjects] = useState<JourneyProject[] | null>(null);
  const [selected, setSelected] = useState(initialProjectId ?? "");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [hour] = useState(() => new Date().getHours());

  useEffect(() => {
    let alive = true;
    createClient()
      .from("todos")
      .select("id,title,status,category,task_date,plan_start_date,target_finish_date,deadline_date,completed_at")
      .eq("task_type", "project")
      .order("plan_start_date", { ascending: false })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) { setError(e.message); setProjects([]); return; }
        const rows = (data ?? []) as JourneyProject[];
        // Unfinished projects first.
        rows.sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
        setProjects(rows);
        setSelected((current) => (rows.some((p) => p.id === current) ? current : rows[0]?.id ?? ""));
      });
    return () => { alive = false; };
  }, []);

  const project = projects?.find((p) => p.id === selected) ?? null;

  useEffect(() => {
    if (!project) return;
    let alive = true;
    setDetail(null);
    const db = createClient();
    void (async () => {
      const [steps, sessions, focus, journey] = await Promise.all([
        db.from("todo_subtasks").select("id,title,completed,completed_at").eq("todo_id", project.id),
        db.from("todo_sessions").select("subtask_id,scheduled_start,plan_date").eq("todo_id", project.id),
        db.from("focus_entries").select("started_at").eq("todo_id", project.id),
        db.from("goal_journeys").select("id").eq("todo_id", project.id).maybeSingle(),
      ]);
      let restDays: string[] = [];
      if (journey.data?.id) {
        const rest = await db.from("goal_journey_days").select("day_date").eq("journey_id", journey.data.id).eq("day_status", "rest");
        restDays = (rest.data ?? []).map((r) => r.day_date as string);
      }
      if (!alive) return;
      const failed = steps.error ?? sessions.error ?? focus.error;
      if (failed) setError(failed.message);
      setDetail({
        steps: (steps.data ?? []).map((s) => ({
          id: s.id as string, title: s.title as string, completed: Boolean(s.completed),
          completed_day: s.completed_at ? localDay(s.completed_at as string) : null,
        })),
        plans: (sessions.data ?? []).flatMap((s) => {
          const day = (s.plan_date as string | null) ?? (s.scheduled_start ? localDay(s.scheduled_start as string) : null);
          return day ? [{ day, subtask_id: (s.subtask_id as string | null) ?? null }] : [];
        }),
        focusDays: (focus.data ?? []).map((f) => localDay(f.started_at as string)),
        restDays,
      });
    })();
    return () => { alive = false; };
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(
    () => (project && detail ? buildJourney({ project, ...detail, today, hour }) : null),
    [project, detail, today, hour]
  );

  // Open on the month that contains today, or the journey's start when it lies ahead.
  useEffect(() => {
    if (!model) return;
    const anchor = today < model.start ? model.start : today > model.end ? model.end : today;
    setMonth(anchor.slice(0, 7));
  }, [model?.start, model?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  if (projects === null) return <div className="card p-8 text-center text-sm text-ink-faint">正在准备旅程…</div>;
  if (!projects.length)
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <img src={catSrc("box")} alt="" className="h-24 w-24" />
        <p className="text-sm text-ink-soft">还没有长期项目。创建一个「长期项目」，小猫就会陪你上路。</p>
        <Link href="/todo" className="rounded-lg border border-sage-300 bg-white px-3 py-2 text-xs font-medium text-sage-700 hover:bg-sage-50">去创建项目</Link>
      </div>
    );

  const catAnimation = model && HOP.includes(model.pose) ? "os-cat-hop" : "os-cat-bob";
  const percent = model ? Math.round(model.progress * 100) : 0;
  const todayDate = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-2xl border border-line bg-white/80 p-3 shadow-soft sm:p-5">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink sm:text-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-50 text-lg">🌱</span>成长旅程
            </h2>
            <p className="mt-1 text-xs text-ink-faint sm:text-sm">把长期目标变成看得见的成长轨迹，每天前进一步。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {projects.length > 1 && (
              <select
                aria-label="选择项目"
                className="max-w-[180px] rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink-soft"
                value={selected}
                onChange={(e) => { setSelected(e.target.value); onProjectChange?.(e.target.value); }}
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}{p.status === "completed" ? "（已完成）" : ""}</option>)}
              </select>
            )}
            <button type="button" aria-label="上个月" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg border border-line bg-white p-1.5 text-ink-soft hover:bg-paper"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[96px] text-center text-sm font-semibold text-ink">{month.slice(0, 4)}年{Number(month.slice(5, 7))}月</span>
            <button type="button" aria-label="下个月" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-lg border border-line bg-white p-1.5 text-ink-soft hover:bg-paper"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => setMonth(today.slice(0, 7))}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${month === today.slice(0, 7) ? "border-line text-ink-soft" : "border-sage-400 bg-sage-50 font-medium text-sage-700"}`}>
              本月
            </button>
          </div>
        </header>

        {error && <p role="alert" className="mb-3 text-xs text-blush-500">读取旅程数据时出错：{error}</p>}
        {model ? (
          <JourneyRoadMonth model={model} month={month} today={today} catSrc={catSrc(model.pose)} catAnimation={catAnimation} projectId={project!.id} />
        ) : (
          <div className="h-[420px] animate-pulse rounded-2xl bg-paper/60" />
        )}
        {model && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span><span className="mr-1 inline-block h-1.5 w-5 rounded-full bg-[#E2BE6E] align-middle" />金色路面：已完成的工作量</span>
            <span>⭐ 阶段目标（设了执行安排日期的步骤）</span>
            <span>🌼 完成步骤的日子</span>
          </p>
        )}
      </section>

      <aside className="space-y-4">
        {/* 今日陪伴 */}
        <section className="rounded-2xl border border-line bg-white/85 p-4 shadow-soft">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-ink">今日陪伴</h3>
            <span className="text-xs text-ink-faint">{md(today)} {WEEKDAY[todayDate.getUTCDay()]}</span>
          </div>
          <div className="relative h-52 overflow-hidden rounded-2xl" style={{ background: "linear-gradient(180deg,#EEF4F6 0%,#F6F8EF 62%,#E3ECD6 62%,#D6E5C8 100%)" }}>
            <img src="/journey/cloud.svg" alt="" className="absolute left-3 top-3 h-7 w-auto opacity-90" />
            <img src="/journey/tree-round.svg" alt="" className="absolute bottom-[30%] left-2 h-20 w-auto" />
            <img src="/journey/tree-pine.svg" alt="" className="absolute bottom-[32%] right-3 h-14 w-auto opacity-80" />
            <img src="/journey/flowers.svg" alt="" className="absolute bottom-2 right-6 h-8 w-auto" />
            <img src="/journey/grass.svg" alt="" className="absolute bottom-3 left-8 h-6 w-auto" />
            {model && <img src={catSrc(model.pose)} alt="今天的小猫" className={`absolute bottom-1 left-[6%] h-[68%] w-auto ${catAnimation}`} />}
            {model && (
              <p className="absolute right-3 top-4 max-w-[58%] whitespace-pre-line rounded-2xl bg-white/90 px-3 py-2 text-xs leading-relaxed text-ink shadow-sm">
                {model.message} <span aria-hidden>💛</span>
              </p>
            )}
          </div>
        </section>

        {/* 项目进度 */}
        {project && model && (
          <section className="rounded-2xl border border-line bg-white/85 p-4 shadow-soft">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-semibold text-ink">项目进度</h3>
              <Link href={"/todo?todoId=" + encodeURIComponent(project.id)} className="text-xs text-sage-700 hover:underline">查看详情 ›</Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3E2B5] text-[#9C7A3C]"><BookOpen className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{project.title}</p>
                <p className="text-xs text-ink-faint">{md(model.start)} – {md(model.end)}（共 {model.totalDays} 天）</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-lg font-semibold tabular-nums text-sage-700">{percent}%</span>
            </div>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-center">
              <div className="py-2.5"><dt className="text-[11px] text-ink-faint">已坚持</dt><dd className="text-lg font-semibold text-ink">{model.activeDays}<span className="ml-0.5 text-xs font-normal">天</span></dd></div>
              <div className="py-2.5"><dt className="text-[11px] text-ink-faint">剩余天数</dt><dd className="text-lg font-semibold text-ink">{model.remainingDays}<span className="ml-0.5 text-xs font-normal">天</span></dd></div>
              <div className="py-2.5">
                <dt className="text-[11px] text-ink-faint">{model.milestones.length ? "里程碑" : "步骤"}</dt>
                <dd className="text-lg font-semibold text-ink">
                  {model.milestones.length ? model.milestones.filter((m) => m.done).length : model.stepsDone}
                  <span className="text-xs font-normal text-ink-faint"> / {model.milestones.length || model.stepsTotal}</span>
                </dd>
              </div>
            </dl>
            {model.pace === "behind" && <p className="mt-2 text-[11px] text-ink-faint">金色路面落在小猫后面，表示工作量比时间进度慢一点。</p>}
            {model.pace === "ahead" && <p className="mt-2 text-[11px] text-ink-faint">金色路面已经跑到小猫前面，进度超前。</p>}
          </section>
        )}

        {/* 小提示 */}
        {model && (
          <section className="flex items-center gap-3 rounded-2xl border border-[#F0E3C4] bg-[#FDF8EC] p-4">
            <img src={catSrc("rest")} alt="" className="h-14 w-14 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#8A6A2E]">💡 小提示</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{model.tip}</p>
            </div>
          </section>
        )}
        {model && dayDiff(today, model.end) < 0 && model.pace !== "done" && (
          <p className="text-center text-[11px] text-ink-faint">截止日期已过，项目还没标记完成。</p>
        )}
      </aside>
    </div>
  );
}
