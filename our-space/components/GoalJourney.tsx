"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Animal = "cat" | "dog" | "rabbit" | "fox";
type Route = "swim" | "run" | "hike" | "cycle";
type Journey = {
  id: string; todo_id: string; start_date: string; target_date: string;
  animal_type: Animal; journey_type: Route; status: "active" | "finished";
  final_completion_percent: number | null; finished_at: string | null;
};
const animals: { id: Animal; emoji: string; name: string }[] = [
  { id: "cat", emoji: "🐱", name: "猫猫" }, { id: "dog", emoji: "🐶", name: "小狗" },
  { id: "rabbit", emoji: "🐰", name: "兔兔" }, { id: "fox", emoji: "🦊", name: "狐狸" },
];
const routes: { id: Route; name: string; emoji: string }[] = [
  { id: "swim", name: "游泳", emoji: "🌊" }, { id: "run", name: "跑步", emoji: "🏃" },
  { id: "hike", name: "登山", emoji: "⛰️" }, { id: "cycle", name: "骑行", emoji: "🚲" },
];
function localDate() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
}
function percent(n: number) { return Math.min(100, Math.max(0, Math.round(n))); }

export default function GoalJourney({ todoId, todoTitle }: { todoId: string; todoTitle: string }) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(localDate);
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 29);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  });
  const [animal, setAnimal] = useState<Animal>("cat");
  const [route, setRoute] = useState<Route>("swim");
  const [steps, setSteps] = useState({ total: 0, completed: 0 });
  const [manualPercent, setManualPercent] = useState(0);
  useEffect(() => {
    let live = true;
    const db = createClient();
    void Promise.all([
      db.from("goal_journeys").select("*").eq("todo_id", todoId).maybeSingle(),
      db.from("todo_subtasks").select("id, completed").eq("todo_id", todoId),
    ]).then(([j, s]) => {
      if (!live) return;
      if (j.error) setError("读取旅程失败：" + j.error.message);
      else setJourney(j.data as Journey | null);
      if (s.error) setError(old => old || "读取步骤失败：" + s.error.message);
      else setSteps({ total: s.data?.length ?? 0, completed: s.data?.filter(x => x.completed).length ?? 0 });
      setLoading(false);
    });
    return () => { live = false; };
  }, [todoId]);

  const dayNumber = (s: string) => { const [y,m,d] = s.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d) / 86400000); };
  const today = localDate();
  const time = journey ? (today < journey.start_date ? 0 : percent(100 * (dayNumber(today)-dayNumber(journey.start_date)+1) / (dayNumber(journey.target_date)-dayNumber(journey.start_date)+1))) : 0;
  const completion = steps.total ? percent(100 * steps.completed / steps.total) : manualPercent;
  const animalEmoji = animals.find(x => x.id === (journey?.animal_type ?? animal))?.emoji ?? "🐱";
  const routeLabel = routes.find(x => x.id === (journey?.journey_type ?? route))?.name ?? "游泳";
  const mood = journey?.status === "finished" ? (journey.final_completion_percent === 100 ? "大获全胜！动物伙伴特别开心！" : "完成了一段旅程，动物伙伴温柔地为你庆祝！") : journey && today < journey.start_date ? "还没出发，伙伴正期待旅程开始。" : steps.total > 0 && steps.completed === steps.total ? "步骤全部完成，真棒！" : journey && today > journey.target_date ? "到达预定日期了，选择结算或继续安排。" : "伙伴正在努力前进，期待今天的进步！";

  async function create() {
    if (busy || !start || !end || end < start) return;
    setBusy(true); setError("");
    const { data, error: err } = await createClient().from("goal_journeys").insert({
      todo_id: todoId, start_date: start, target_date: end, animal_type: animal, journey_type: route,
    }).select("*").single();
    if (err) setError("创建失败：" + err.message);
    else setJourney(data as Journey);
    setBusy(false);
  }
  async function finish() {
    if (!journey || busy || !window.confirm("结束这段旅程并根据当前完成度结算？")) return;
    setBusy(true); setError("");
    const finalPercent = completion;
    const { data, error: err } = await createClient().from("goal_journeys").update({
      status: "finished", final_completion_percent: finalPercent, finished_at: new Date().toISOString(),
    }).eq("id", journey.id).select("*").single();
    if (err) setError("结束失败：" + err.message);
    else setJourney(data as Journey);
    setBusy(false);
  }

  return <div className="rounded-2xl border border-sage-100 bg-[#FAFBF7] p-4 text-sm">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h4 className="font-medium text-ink">成长旅程 · {todoTitle}</h4>
      <span className="text-xs text-ink-faint">{journey?.status === "finished" ? "已结束" : "陪你慢慢向前"}</span>
    </div>
    {loading ? <p className="text-xs text-ink-faint">正在读取旅程…</p> : !journey ? (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs text-ink-soft">选择小动物</p>
          <div className="flex flex-wrap gap-2">{animals.map(a => <button type="button" key={a.id}
            onClick={() => setAnimal(a.id)} aria-pressed={animal === a.id}
            className={`rounded-xl border px-3 py-2 ${animal === a.id ? "border-sage-500 bg-sage-50" : "border-line bg-white"}`}>
            {a.emoji} {a.name}
          </button>)}</div>
        </div>
        <div>
          <p className="mb-2 text-xs text-ink-soft">选择旅行方式</p>
          <div className="flex flex-wrap gap-2">{routes.map(r => <button type="button" key={r.id}
            onClick={() => setRoute(r.id)} aria-pressed={route === r.id}
            className={`rounded-xl border px-3 py-2 ${route === r.id ? "border-sage-500 bg-sage-50" : "border-line bg-white"}`}>
            {r.emoji} {r.name}
          </button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-ink-soft">开始日期<input type="date" value={start} onChange={e => setStart(e.target.value)} className="input mt-1 w-full" /></label>
          <label className="text-xs text-ink-soft">目标日期<input type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} className="input mt-1 w-full" /></label>
        </div>
        <button type="button" onClick={() => void create()} disabled={busy || !start || end < start}
          className="rounded-xl bg-sage-100 px-4 py-2 font-medium text-sage-700 disabled:opacity-50">开启旅程</button>
      </div>
    ) : (
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">{journey.start_date} → {journey.target_date} · {routeLabel}</p>
        <div className="rounded-2xl bg-[#E9F4F6] p-4">
          <div className="flex items-center justify-between text-xs text-[#66858B]"><span>起点</span><span>终点</span></div>
          <div className="relative my-6 h-2 rounded-full bg-[#CAE2E8]">
            <div className="h-2 rounded-full bg-[#85B8C7]" style={{ width: time + "%" }} />
            <span className="absolute -top-5 text-2xl" style={{ left: `clamp(0px, calc(${time}% - 12px), calc(100% - 28px))` }}>{animalEmoji}</span>
          </div>
          <p className="text-xs text-[#66858B]">时间旅程 {time}%</p>
          <p className="mt-2 rounded-lg bg-white/75 px-3 py-2 text-xs text-[#607C81]">{journey.status === "finished" ? (journey.final_completion_percent === 100 ? "🥳" : "😊") : "🐾"} {mood}</p>
        </div>
        {steps.total === 0 && journey.status === "active" && <label className="block text-xs text-ink-soft">
          尚未设置步骤，可暂时手动记录完成度：{manualPercent}%
          <input className="w-full" type="range" min="0" max="100" value={manualPercent} onChange={e => setManualPercent(Number(e.target.value))}/>
          <span className="text-[11px] text-ink-faint">手动完成度仅在当前页面有效；请添加步骤以获得可持久追踪的进度。</span>
        </label>}
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>实际完成度 {journey.status === "finished" ? journey.final_completion_percent : completion}%</span>
          <span>{steps.total ? `${steps.completed}/${steps.total} 步已完成` : "建议拆分成可完成的步骤"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sage-100"><div className="h-full rounded-full bg-sage-500"
          style={{ width: (journey.status === "finished" ? journey.final_completion_percent : completion) + "%" }}/></div>
        {journey.status === "finished"
          ? <p className="rounded-xl bg-white p-3 text-center">{(journey.final_completion_percent ?? 0) === 100 ? "🥳 完美达成！特别开心！" : "😊 这段旅程有收获，下次再一起出发！"}</p>
          : <button type="button" disabled={busy} onClick={() => void finish()}
              className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-soft">结束旅程并结算</button>}
      </div>
    )}
    {error && <p role="alert" className="mt-3 text-xs text-blush-500">{error}</p>}
  </div>;
}
