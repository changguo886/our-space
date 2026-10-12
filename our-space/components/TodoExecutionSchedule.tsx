"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "flexible" | "window" | "fixed";
type Plan = { id:string; mode:"flexible"|"window"; plan_date:string; planned_minutes:number; window_start:string|null; window_end:string|null };
type Session = { id:string; scheduled_start:string; scheduled_end:string };
function localDate(d:Date){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function localTime(d:Date){return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function validTime(value:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return false;return true;}
function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T12:00:00");return !Number.isNaN(d.getTime())&&localDate(d)===value;}
function toFixedDateTime(date:string,time:string){return new Date(date+"T"+time+":00");}
const field="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink";

export default function TodoExecutionSchedule({todoId}:{todoId:string}){
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>("flexible");
  const [date,setDate]=useState(()=>localDate(new Date()));
  const [minutes,setMinutes]=useState("45");
  const [windowStart,setWindowStart]=useState("18:00");
  const [windowEnd,setWindowEnd]=useState("22:00");
  const [fixedStartDate,setFixedStartDate]=useState(()=>localDate(new Date()));
  const [fixedStartTime,setFixedStartTime]=useState(()=>localTime(new Date()));
  const [fixedEndDate,setFixedEndDate]=useState(()=>localDate(new Date(Date.now()+45*60000)));
  const [fixedEndTime,setFixedEndTime]=useState(()=>localTime(new Date(Date.now()+45*60000)));
  const [plans,setPlans]=useState<Plan[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  async function refresh(){
    setLoading(true);
    const db=createClient();
    const [p,s]=await Promise.all([
      db.from("todo_execution_plans").select("id,mode,plan_date,planned_minutes,window_start,window_end").eq("todo_id",todoId).order("plan_date",{ascending:false}),
      db.from("todo_sessions").select("id,scheduled_start,scheduled_end").eq("todo_id",todoId).order("scheduled_start",{ascending:false})
    ]);
    if(p.error)setError("读取灵活计划失败（请确认已在当前环境执行 V3 M2）："+p.error.message);
    else if(s.error)setError("读取预约时段失败："+s.error.message);
    else {setPlans((p.data??[]) as Plan[]);setSessions((s.data??[]) as Session[]);setError("");}
    setLoading(false);
  }
  useEffect(()=>{void refresh();},[todoId]);
  async function save(){
    setError("");
    if(mode!=="fixed"&&(!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440)){setError("计划投入需为 1–1440 分钟。");return;}
    if(mode==="window"&&windowEnd<=windowStart){setError("时间窗口结束时间必须晚于开始时间。");return;}
    if(mode==="fixed"&&(!validDate(fixedStartDate)||!validDate(fixedEndDate)||!validTime(fixedStartTime)||!validTime(fixedEndTime))){setError("请填写有效日期（YYYY-MM-DD）与24小时制时间（HH:mm）。");return;}
    if(mode==="fixed"&&toFixedDateTime(fixedEndDate,fixedEndTime).getTime()<=toFixedDateTime(fixedStartDate,fixedStartTime).getTime()){setError("固定结束时间必须晚于开始时间。");return;}
    setSaving(true);
    const db=createClient();
    const result=mode==="fixed" ? await db.from("todo_sessions").insert({todo_id:todoId,scheduled_start:toFixedDateTime(fixedStartDate,fixedStartTime).toISOString(),scheduled_end:toFixedDateTime(fixedEndDate,fixedEndTime).toISOString()}) : await db.from("todo_execution_plans").insert({todo_id:todoId,plan_date:date,mode,planned_minutes:Number(minutes),window_start:mode==="window"?windowStart:null,window_end:mode==="window"?windowEnd:null});
    setSaving(false);
    if(result.error){setError("保存失败："+result.error.message);return;}
    await refresh();setOpen(false);
  }
  return <section className="mt-4 rounded-xl border border-line bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-ink">执行安排</h3><p className="text-xs text-ink-faint">只有固定时段会显示在 Calendar。</p></div>
      <button type="button" className="rounded-lg border border-sage-300 px-3 py-2 text-xs text-sage-700" onClick={()=>setOpen(v=>!v)}>{open?"收起":"＋ 安排执行"}</button>
    </div>
    {loading?<p className="mt-3 text-xs text-ink-faint">读取安排中…</p>:<div className="mt-3 space-y-1.5">
      {plans.map(p=><div key={p.id} className="rounded-lg bg-paper/60 px-3 py-2 text-xs text-ink-soft">{p.plan_date} · {p.mode==="flexible"?"灵活安排":`时间窗口 ${p.window_start?.slice(0,5)}–${p.window_end?.slice(0,5)}`} · {p.planned_minutes} 分钟</div>)}
      {sessions.map(s=><div key={s.id} className="rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">固定时段 · {new Date(s.scheduled_start).toLocaleString()} – {new Date(s.scheduled_end).toLocaleTimeString()}</div>)}
      {!plans.length&&!sessions.length&&<p className="text-xs text-ink-faint">尚无执行安排。可以先不安排。</p>}
    </div>}
    {open&&<div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="grid grid-cols-3 gap-1.5">{([{id:"flexible",label:"灵活安排"},{id:"window",label:"时间窗口"},{id:"fixed",label:"固定时段"}] as const).map(x=><button type="button" key={x.id} onClick={()=>setMode(x.id)} aria-pressed={mode===x.id} className={`rounded-lg border px-1 py-2 text-xs ${mode===x.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{x.label}</button>)}</div>
      {mode!=="fixed"&&<><label className="block text-xs text-ink-soft">执行日期<input className={field+" mt-1"} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="block text-xs text-ink-soft">计划投入（分钟）<input className={field+" mt-1"} type="number" min="1" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label></>}
      {mode==="window"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">最早开始<input className={field+" mt-1"} type="time" value={windowStart} onChange={e=>setWindowStart(e.target.value)}/></label><label className="text-xs text-ink-soft">最晚结束<input className={field+" mt-1"} type="time" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label></div>}
      {mode==="fixed"&&<div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs text-ink-soft">开始日期（YYYY-MM-DD）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="2026-10-15" value={fixedStartDate} onChange={e=>setFixedStartDate(e.target.value)}/></label>
          <label className="block text-xs text-ink-soft">开始时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:00" value={fixedStartTime} onChange={e=>setFixedStartTime(e.target.value)}/></label>
          <label className="block text-xs text-ink-soft">结束日期（YYYY-MM-DD）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="2026-10-15" value={fixedEndDate} onChange={e=>setFixedEndDate(e.target.value)}/></label>
          <label className="block text-xs text-ink-soft">结束时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:45" value={fixedEndTime} onChange={e=>setFixedEndTime(e.target.value)}/></label>
        </div>
        <p className="text-xs text-ink-faint">支持直接输入日期与时间，例如 2026-10-15、20:45；可以跨日期预约。</p>
      </div>}
      <p className="text-xs text-ink-faint">{mode==="fixed"?"保存后在 Calendar 创建预约时间块。":mode==="window"?"窗口不是连续预约时长，也不会显示在 Calendar。":"只记录投入计划，不占用 Calendar。"}</p>
      <button type="button" disabled={saving} className="btn-primary w-full" onClick={()=>void save()}>{saving?"保存中…":"保存执行安排"}</button>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
