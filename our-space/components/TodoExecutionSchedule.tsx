"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { upcomingEligible, type HabitPatternV3, type ExecutionTemplateV3 } from "@/lib/recurring-execution";

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
  const [scope,setScope]=useState<"once"|"all"|"by_day">("once");
  const [selector,setSelector]=useState("all");
  const [pattern,setPattern]=useState<HabitPatternV3|null>(null);
  const [todoStart,setTodoStart]=useState("");
  const [projectEnd,setProjectEnd]=useState<string|null>(null);
  const [templates,setTemplates]=useState<ExecutionTemplateV3[]>([]);
  const [timezone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC");
  const [editingTemplateId,setEditingTemplateId]=useState<string|null>(null);
  const [overrideSlot,setOverrideSlot]=useState("");
  const [overrideDate,setOverrideDate]=useState(()=>localDate(new Date()));
  const [overrideStart,setOverrideStart]=useState("09:00");
  const [overrideEnd,setOverrideEnd]=useState("10:00");
  const [overrideAction,setOverrideAction]=useState<"cancel"|"reschedule">("reschedule");
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
    const [p,s,h,t,td]=await Promise.all([
      db.from("todo_execution_plans").select("id,mode,plan_date,planned_minutes,window_start,window_end").eq("todo_id",todoId).order("plan_date",{ascending:false}),
      db.from("todo_sessions").select("id,scheduled_start,scheduled_end").eq("todo_id",todoId).order("scheduled_start",{ascending:false}),
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end").eq("todo_id",todoId).maybeSingle(),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end").eq("todo_id",todoId),
      db.from("todos").select("task_date,plan_start_date,target_finish_date").eq("id",todoId).single()
    ]);
    if(p.error)setError("读取灵活计划失败（请确认已在当前环境执行 V3 M2）："+p.error.message);
    else if(s.error)setError("读取预约时段失败："+s.error.message);
    else {setPlans((p.data??[]) as Plan[]);setSessions((s.data??[]) as Session[]);setError(t.error?t.error.message:"");if(!h.error)setPattern(h.data as HabitPatternV3|null);if(!t.error)setTemplates((t.data??[]) as ExecutionTemplateV3[]);if(!td.error&&td.data){setTodoStart(td.data.plan_start_date??td.data.task_date);setProjectEnd(td.data.target_finish_date??null);}}
    setLoading(false);
  }
  useEffect(()=>{void refresh();},[todoId]);
  async function save(){
    setError("");
    if(mode!=="fixed"&&(!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440)){setError("计划投入需为 1–1440 分钟。");return;}
    if(mode==="window"&&windowEnd<=windowStart){setError("时间窗口结束时间必须晚于开始时间。");return;}
    if(scope==="once"&&mode==="fixed"&&(!validDate(fixedStartDate)||!validDate(fixedEndDate)||!validTime(fixedStartTime)||!validTime(fixedEndTime))){setError("请填写有效日期（YYYY-MM-DD）与24小时制时间（HH:mm）。");return;}
    if(scope==="once"&&mode==="fixed"&&toFixedDateTime(fixedEndDate,fixedEndTime).getTime()<=toFixedDateTime(fixedStartDate,fixedStartTime).getTime()){setError("固定结束时间必须晚于开始时间。");return;}
    setSaving(true);
    const db=createClient();
    const repeating=scope!=="once";
    const selected=selector.split(":");
    const selectorKind=scope==="all"?"all":selected[0];
    const selectorValue=scope==="all"?null:selected[1]?Number(selected[1]):null;
    if(repeating&&selectorKind==="all"&&scope==="by_day"){setSaving(false);setError("请先选择需要分别安排的日期。");return;}
    if(repeating&&!pattern&&!projectEnd){setSaving(false);setError("此任务没有重复规则或计划结束日期，请使用单次安排。");return;}
    if(repeating&&mode==="fixed"&&(fixedStartTime>=fixedEndTime||!validTime(fixedStartTime)||!validTime(fixedEndTime))){setSaving(false);setError("重复固定时段必须在同一天内结束，且结束时间晚于开始时间。");return;}
    const result=repeating&&editingTemplateId
      ? await db.rpc("revise_execution_template_v3",{
          p_template_id:editingTemplateId,
          p_effective_on:date,
          p_new_mode:mode,
          p_start_time:mode==="fixed"?fixedStartTime:null,
          p_end_time:mode==="fixed"?fixedEndTime:null,
          p_window_start:mode==="window"?windowStart:null,
          p_window_end:mode==="window"?windowEnd:null,
          p_planned_minutes:mode==="fixed"?null:Number(minutes),
        })
      : repeating
      ? await db.from("todo_execution_templates").insert({
          todo_id:todoId,starts_on:date<todoStart?todoStart:date,ends_on:projectEnd,
          timezone,execution_mode:mode,selector_kind:selectorKind,selector_value:selectorValue,
          start_time:mode==="fixed"?fixedStartTime:null,end_time:mode==="fixed"?fixedEndTime:null,
          window_start:mode==="window"?windowStart:null,window_end:mode==="window"?windowEnd:null,
          planned_minutes:mode==="fixed"?null:Number(minutes),
        })
      : mode==="fixed" ? await db.from("todo_sessions").insert({todo_id:todoId,scheduled_start:toFixedDateTime(fixedStartDate,fixedStartTime).toISOString(),scheduled_end:toFixedDateTime(fixedEndDate,fixedEndTime).toISOString()}) : await db.from("todo_execution_plans").insert({todo_id:todoId,plan_date:date,mode,planned_minutes:Number(minutes),window_start:mode==="window"?windowStart:null,window_end:mode==="window"?windowEnd:null});
    setSaving(false);
    if(result.error){setError("保存失败："+result.error.message);return;}
    await refresh();setOpen(false);setEditingTemplateId(null);
  }
  async function saveOverride(){
    const t=templates.find(x=>x.id===overrideSlot);
    if(!t){setError("请先选择重复安排。");return;}
    if(!validDate(overrideDate)||overrideDate<t.starts_on||(t.ends_on&&overrideDate>t.ends_on)){setError("请选择模板有效期内的日期。");return;}
    if(overrideAction==="reschedule"&&(!validTime(overrideStart)||!validTime(overrideEnd)||overrideEnd<=overrideStart)){setError("改期时间必须是同一天内有效的开始和结束时间。");return;}
    setSaving(true);const change=overrideAction==="cancel"?{scheduled_start:null,scheduled_end:null}:{
      scheduled_start:toFixedDateTime(overrideDate,overrideStart).toISOString(),
      scheduled_end:toFixedDateTime(overrideDate,overrideEnd).toISOString(),
    };
    const {error:writeError}=await createClient().from("todo_execution_overrides").upsert({
      todo_id:todoId,slot_key:t.slot_key,occurrence_date:overrideDate,action:overrideAction,...change
    },{onConflict:"todo_id,slot_key,occurrence_date"});
    setSaving(false);
    if(writeError){setError("保存单次调整失败："+writeError.message);return;}
    setError("");await refresh();
  }
  return <section className="mt-4 rounded-xl border border-line bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-ink">执行安排</h3><p className="text-xs text-ink-faint">只有固定时段会显示在 Calendar。</p></div>
      <button type="button" className="rounded-lg border border-sage-300 px-3 py-2 text-xs text-sage-700" onClick={()=>setOpen(v=>!v)}>{open?"收起":"＋ 安排执行"}</button>
    </div>
    {loading?<p className="mt-3 text-xs text-ink-faint">读取安排中…</p>:<div className="mt-3 space-y-1.5">
      {plans.map(p=><div key={p.id} className="rounded-lg bg-paper/60 px-3 py-2 text-xs text-ink-soft">{p.plan_date} · {p.mode==="flexible"?"灵活安排":`时间窗口 ${p.window_start?.slice(0,5)}–${p.window_end?.slice(0,5)}`} · {p.planned_minutes} 分钟</div>)}
      {sessions.map(s=><div key={s.id} className="rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">固定时段 · {new Date(s.scheduled_start).toLocaleString()} – {new Date(s.scheduled_end).toLocaleTimeString()}</div>)}
      {templates.map(t=><div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-sage-50 px-3 py-2 text-xs text-sage-700"><span>未来重复 · {t.selector_kind==="all"?"所有符合日期":t.selector_kind==="weekday"?"星期"+t.selector_value:t.selector_kind==="month_day"?"每月"+t.selector_value+"日":"月末"} · {t.execution_mode==="fixed"?t.start_time?.slice(0,5)+"–"+t.end_time?.slice(0,5):t.execution_mode==="window"?"时间窗口":"灵活安排"} · 从 {t.starts_on}</span><span className="flex shrink-0 gap-2"><button type="button" className="underline" onClick={()=>{setEditingTemplateId(t.id);setScope("all");setOpen(true);setDate(t.starts_on>date?t.starts_on:date);setMode(t.execution_mode);setFixedStartTime(t.start_time?.slice(0,5)??"09:00");setFixedEndTime(t.end_time?.slice(0,5)??"10:00");setWindowStart(t.window_start?.slice(0,5)??"08:00");setWindowEnd(t.window_end?.slice(0,5)??"12:00");setMinutes(String(t.planned_minutes??45));}}>从这天起修改</button><button type="button" className="underline" onClick={async()=>{if(!window.confirm("删除这条未来重复安排？"))return;const x=await createClient().from("todo_execution_templates").delete().eq("id",t.id);if(x.error)setError(x.error.message);else await refresh();}}>删除</button></span></div>)}
      {!plans.length&&!sessions.length&&!templates.length&&<p className="text-xs text-ink-faint">尚无执行安排。可以先不安排。</p>}
    </div>}
    {templates.some(t=>t.execution_mode==="fixed")&&<details className="mt-4 rounded-xl border border-line p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink-soft">修改／取消某一次固定预约</summary>
      <div className="mt-3 space-y-2">
        <label className="block text-xs text-ink-soft">重复时段<select className={field+" mt-1"} value={overrideSlot} onChange={e=>setOverrideSlot(e.target.value)}><option value="">请选择</option>{templates.filter(t=>t.execution_mode==="fixed").map(t=><option key={t.id} value={t.id}>{t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)} · {t.selector_kind==="all"?"所有日期":t.selector_kind+" "+(t.selector_value??"末日")}</option>)}</select></label>
        <label className="block text-xs text-ink-soft">只调整这一天<input type="date" className={field+" mt-1"} value={overrideDate} onChange={e=>setOverrideDate(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2">{(["reschedule","cancel"] as const).map(x=><button key={x} type="button" className={`rounded-lg border p-2 text-xs ${overrideAction===x?"border-sage-400 bg-sage-50":"border-line"}`} onClick={()=>setOverrideAction(x)}>{x==="cancel"?"取消这一次":"仅这次改时间"}</button>)}</div>
        {overrideAction==="reschedule"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">开始<input type="time" className={field+" mt-1"} value={overrideStart} onChange={e=>setOverrideStart(e.target.value)}/></label><label className="text-xs text-ink-soft">结束<input type="time" className={field+" mt-1"} value={overrideEnd} onChange={e=>setOverrideEnd(e.target.value)}/></label></div>}
        <button type="button" disabled={saving||!overrideSlot} className="btn-primary w-full" onClick={()=>void saveOverride()}>{saving?"保存中…":"仅保存这一次"}</button>
      </div>
    </details>}
    {open&&<div className="mt-4 space-y-3 border-t border-line pt-4">
      {editingTemplateId&&<p className="rounded-lg bg-sage-50 p-2 text-xs text-sage-700">正在修改已保存的重复安排。日期表示「从这天开始采用新时间」，更早的执行模板保留。<button type="button" className="ml-2 underline" onClick={()=>setEditingTemplateId(null)}>取消修改</button></p>}
      <p className="text-xs font-semibold text-ink-soft">1. 应用范围</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([{id:"once",label:"仅某一次"},{id:"all",label:"以后每一次"},{id:"by_day",label:"不同日期分别设置"}] as const).map(x=><button key={x.id} type="button" aria-pressed={scope===x.id} onClick={()=>{setScope(x.id);setSelector("all");}} className={`rounded-lg border px-2 py-2 text-xs ${scope===x.id?"border-sage-400 bg-sage-50":"border-line"}`}>{x.label}</button>)}
      </div>
      {scope==="by_day"&&<label className="block text-xs text-ink-soft">选择重复日期
        <select className={field+" mt-1"} value={selector} onChange={e=>setSelector(e.target.value)}>
          <option value="all">请选择日期</option>
          {pattern?.period==="week"&&pattern.arrangement==="fixed"&&(pattern.weekdays??[]).map(x=><option key={x} value={"weekday:"+x}>每周星期{"一二三四五六日"[x-1]}</option>)}
          {pattern?.period==="month"&&pattern.arrangement==="fixed"&&(pattern.month_days??[]).map(x=><option key={x} value={"month_day:"+x}>每月 {x} 日</option>)}
          {pattern?.period==="month"&&pattern.include_month_end&&<option value="month_end">每月最后一天</option>}
          {!pattern&&projectEnd&&[1,2,3,4,5,6,7].map(x=><option key={x} value={"weekday:"+x}>每周星期{"一二三四五六日"[x-1]}</option>)}
        </select>
      </label>}
      {scope!=="once"&&<p className="text-xs text-ink-faint">将从所选开始日期起，对未来符合任务规则的日期持续生效；不批量生成日历预约记录。</p>}
      {pattern&&<p className="text-xs text-ink-faint">接下来：{upcomingEligible(pattern,todoStart||date,date,370,3).join("、")||"暂无符合日期"}</p>}
      <p className="text-xs font-semibold text-ink-soft">2. 时间方式</p>
      <div className="grid grid-cols-3 gap-1.5">{([{id:"flexible",label:"灵活安排"},{id:"window",label:"时间窗口"},{id:"fixed",label:"固定时段"}] as const).map(x=><button type="button" key={x.id} onClick={()=>setMode(x.id)} aria-pressed={mode===x.id} className={`rounded-lg border px-1 py-2 text-xs ${mode===x.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{x.label}</button>)}</div>
      {(scope!=="once"||mode!=="fixed")&&<><label className="block text-xs text-ink-soft">执行日期<input className={field+" mt-1"} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="block text-xs text-ink-soft">计划投入（分钟）<input className={field+" mt-1"} type="number" min="1" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label></>}
      {mode==="window"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">最早开始<input className={field+" mt-1"} type="time" value={windowStart} onChange={e=>setWindowStart(e.target.value)}/></label><label className="text-xs text-ink-soft">最晚结束<input className={field+" mt-1"} type="time" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label></div>}
      {mode==="fixed"&&<div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scope==="once"&&<label className="block text-xs text-ink-soft">开始日期（YYYY-MM-DD）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="2026-10-15" value={fixedStartDate} onChange={e=>setFixedStartDate(e.target.value)}/></label>}
          <label className="block text-xs text-ink-soft">开始时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:00" value={fixedStartTime} onChange={e=>setFixedStartTime(e.target.value)}/></label>
          {scope==="once"&&<label className="block text-xs text-ink-soft">结束日期（YYYY-MM-DD）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="2026-10-15" value={fixedEndDate} onChange={e=>setFixedEndDate(e.target.value)}/></label>}
          <label className="block text-xs text-ink-soft">结束时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:45" value={fixedEndTime} onChange={e=>setFixedEndTime(e.target.value)}/></label>
        </div>
        <p className="text-xs text-ink-faint">支持直接输入日期与时间，例如 2026-10-15、20:45；可以跨日期预约。</p>
      </div>}
      <p className="text-xs text-ink-faint">{mode==="fixed"?"固定时段会显示在 Calendar；重复设置自动生成未来时段。":mode==="window"?"窗口不是连续预约时长，也不会显示在 Calendar。":"只记录投入计划，不占用 Calendar。"}</p>
      <button type="button" disabled={saving} className="btn-primary w-full" onClick={()=>void save()}>{saving?"保存中…":editingTemplateId?"从选定日期起更新":"保存执行安排"}</button>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
