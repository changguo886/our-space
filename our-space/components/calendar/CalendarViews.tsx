"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import CalendarPlanner from "@/components/calendar/CalendarPlanner";
import JourneyCalendar from "@/components/JourneyCalendar";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { templateEligible, type ExecutionTemplateV3, type HabitPatternV3, type ExecutionOverrideV3 } from "@/lib/recurring-execution";

type EventSession = { id:string; scheduled_start:string; scheduled_end:string; reminder_minutes_before:number|null };
type CalendarTask = { id:string; title:string; task_date?:string; task_type?:"one_time"|"recurring"|"habit"; todo_sessions: EventSession[]; scheduled_start:string|null; scheduled_end:string|null };
type JourneyRow = { id:string; todo_id:string; start_date:string; target_date:string; animal_type:string; journey_type:string; status:string; color_key:string };
const JOURNEY_PALETTE:Record<string,string> = {blue:"#4B83D1",green:"#38A179",purple:"#9268C5",orange:"#DE9144",pink:"#D9769B",teal:"#329B9C"};
type Props = { initialTodos: React.ComponentProps<typeof CalendarPlanner>["initialTodos"]; initialDate:string };
type Mode = "day"|"week"|"month"|"journey";
const modes: { key:Mode; title:string }[]=[{key:"day",title:"日"},{key:"week",title:"周"},{key:"month",title:"月"},{key:"journey",title:"旅程"}];
function dateOf(y:number,m:number,d:number) { return [y,String(m+1).padStart(2,"0"),String(d).padStart(2,"0")].join("-"); }
function addDay(s:string,n:number) { const [y,m,d]=s.split("-").map(Number);const v=new Date(y,m-1,d+n);return dateOf(v.getFullYear(),v.getMonth(),v.getDate()); }
function addMonth(s:string,n:number){const [y,m]=s.split("-").map(Number);const d=new Date(y,m-1+n,1);return dateOf(d.getFullYear(),d.getMonth(),1);}
function inDay(s:string,day:string) { const d=new Date(s);return !Number.isNaN(d.getTime())&&dateOf(d.getFullYear(),d.getMonth(),d.getDate())===day; }
export default function CalendarViews({initialTodos,initialDate}:Props) {
  const params=useSearchParams();const router=useRouter();
  const queryMode=params.get("view");const requested=queryMode==="journey"||queryMode==="month"||queryMode==="week"?"journey"===queryMode?"journey":queryMode:"day";
  const [mode,setMode]=useState<Mode>(requested);
  const [date,setDate]=useState(params.get("date")?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]??initialDate);
  const [journeys,setJourneys]=useState<JourneyRow[]>([]);
  const [selectedTodo,setSelectedTodo]=useState(params.get("todoId")??"");
  const [loadError,setLoadError]=useState("");
  const [patterns,setPatterns]=useState<Record<string,HabitPatternV3>>({});
  const [templates,setTemplates]=useState<ExecutionTemplateV3[]>([]);
  const [overrides,setOverrides]=useState<ExecutionOverrideV3[]>([]);
  useEffect(()=>{
    let live=true;const db=createClient();
    void Promise.all([
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end"),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end"),
      db.from("todo_execution_overrides").select("todo_id,slot_key,occurrence_date,action,scheduled_start,scheduled_end")
    ]).then(([p,t,o])=>{if(!live)return;
      if(!p.error)setPatterns(Object.fromEntries(((p.data??[]) as HabitPatternV3[]).map(x=>[x.todo_id,x])));
      if(!t.error)setTemplates((t.data??[]) as ExecutionTemplateV3[]);
      if(!o.error)setOverrides((o.data??[]) as ExecutionOverrideV3[]);
      if(t.error)setLoadError("重复安排载入失败："+t.error.message);
    });return()=>{live=false};
  },[]);
  useEffect(()=>{setMode(requested);if(params.get("todoId"))setSelectedTodo(params.get("todoId")??"");},[requested,params]);
  useEffect(()=>{if(mode!=="journey"&&mode!=="month"&&mode!=="week")return;let alive=true;
    void createClient().from("goal_journeys").select("id,todo_id,start_date,target_date,animal_type,journey_type,status,color_key")
      .order("start_date",{ascending:false}).then(({data,error})=>{
      if(!alive)return;if(error)setLoadError(error.message);else{setJourneys((data??[]) as JourneyRow[]);setLoadError("");}
    });return()=>{alive=false;};
  },[mode]);
  function change(next:Mode){setMode(next);const url=new URLSearchParams();url.set("view",next);url.set("date",date);if(next==="journey"&&selectedTodo)url.set("todoId",selectedTodo);router.replace("/calendar?"+url.toString(),{scroll:false});}
  const [y,m]=date.split("-").map(Number);const month=date.slice(0,7);
  const monthly=Array.from({length:new Date(y,m,0).getDate()},(_,i)=>dateOf(y,m-1,i+1));
  const tasks=initialTodos as CalendarTask[];
  const sessions=tasks.flatMap(todo=>[...(todo.todo_sessions??[]).map(s=>({todoId:todo.id,title:todo.title,start:s.scheduled_start,end:s.scheduled_end})),
    ...(todo.todo_sessions?.length?[]:todo.scheduled_start&&todo.scheduled_end?[{todoId:todo.id,title:todo.title,start:todo.scheduled_start,end:todo.scheduled_end}]:[])]);
  function recurringEvents(d:string){
    return templates.filter(t=>t.execution_mode==="fixed"&&t.start_time&&t.end_time&&
      templateEligible(d,t,patterns[t.todo_id],tasks.find(x=>x.id===t.todo_id)?.task_date)).flatMap(t=>{
      const change=overrides.find(x=>x.todo_id===t.todo_id&&x.slot_key===t.slot_key&&x.occurrence_date===d);
      if(change?.action==="cancel")return [];
      const title=tasks.find(x=>x.id===t.todo_id)?.title??"任务";
      if(change?.action==="reschedule"&&change.scheduled_start&&change.scheduled_end){
        return inDay(change.scheduled_start,d)?[{todoId:t.todo_id,title:title+"（已调整）",start:change.scheduled_start,end:change.scheduled_end}]:[];
      }
      return [{todoId:t.todo_id,title:title+"（重复）",start:d+"T"+t.start_time!.slice(0,5)+":00",end:d+"T"+t.end_time!.slice(0,5)+":00"}];
    });
  }
  function eventsOn(d:string){return [...sessions.filter(s=>inDay(s.start,d)),...recurringEvents(d)];}
  const taskTitle = new Map(tasks.map(t=>[t.id,t.title]));
  const activeJourney=journeys.find(j=>j.todo_id===selectedTodo)??journeys[0];
  return <div className="mt-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-ink">Calendar</h1><p className="mt-1 text-xs text-ink-faint">同一个计划中心 · 日程、月份与成长旅程</p></div>
      <div role="group" aria-label="日历视图" className="flex gap-1 rounded-xl border border-line bg-white p-1">
        {modes.map(x=><button key={x.key} type="button" onClick={()=>change(x.key)}
          aria-pressed={mode===x.key}
          className={`rounded-lg px-3 py-2 text-sm ${mode===x.key?"bg-sage-100 font-medium text-sage-700":"text-ink-soft hover:bg-paper"}`}>{x.title}</button>)}
      </div>
    </div>
    {mode==="day" ? <div className="space-y-3">
      <CalendarPlanner initialTodos={initialTodos} initialDate={date}/>
      {recurringEvents(date).length>0&&<section className="rounded-xl border border-line bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-ink-soft">重复固定时段（预览，不创建独立预约）</p>
        {recurringEvents(date).map((e,i)=><div key={e.todoId+i} className="mb-1 rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">{e.start.slice(11,16)}–{e.end.slice(11,16)} · {e.title} <Link href={"/todo?todoId="+encodeURIComponent(e.todoId)} className="underline">调整安排</Link></div>)}
      </section>}
    </div> :
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-ink">{mode==="week"?"本周":month+" 月"}</div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-line px-3 py-1" aria-label="上一段"
            onClick={()=>setDate(d=>mode==="week"?addDay(d,-7):addMonth(d,-1))}>‹</button>
          <button type="button" className="rounded-lg border border-line px-3 py-1 text-xs" onClick={()=>setDate(initialDate)}>今天</button>
          <button type="button" className="rounded-lg border border-line px-3 py-1" aria-label="下一段"
            onClick={()=>setDate(d=>mode==="week"?addDay(d,7):addMonth(d,1))}>›</button>
        </div>
      </div>
      {mode==="journey"?<div className="rounded-2xl border border-line bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-faint">成长旅程 · 选择任务，查看日期中的点滴进展</p><Link className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-medium text-sage-700 hover:bg-sage-50" href={activeJourney?"/todo?todoId="+encodeURIComponent(activeJourney.todo_id):"/todo"}>← 返回任务</Link></div>
        <label className="mb-3 block text-sm text-ink-soft">选择长期旅程
          <select className="input mt-1 w-full" value={activeJourney?.todo_id??""} onChange={e=>setSelectedTodo(e.target.value)}>
            {journeys.map(j=><option key={j.id} value={j.todo_id}>{initialTodos.find(t=>t.id===j.todo_id)?.title??"长期任务"}</option>)}
          </select>
        </label>
        {activeJourney && <p className="mb-3 flex items-center gap-2 text-xs text-ink-soft"><span className="h-3 w-7 rounded-full" style={{backgroundColor:JOURNEY_PALETTE[activeJourney.color_key]??JOURNEY_PALETTE.blue}} />旅程颜色：{activeJourney.color_key}</p>}
        {loadError?<p role="alert" className="text-xs text-blush-500">读取旅程失败：{loadError}</p>:activeJourney?
          <JourneyCalendar key={activeJourney.id} journeyId={activeJourney.id} startDate={activeJourney.start_date}
            targetDate={activeJourney.target_date} animal={activeJourney.animal_type} route={activeJourney.journey_type} initialDate={date}/>:
          <p className="text-sm text-ink-faint">还没有成长旅程。请先从 Todo 创建一条长期旅程。</p>}
      </div>:<div className="rounded-2xl border border-line bg-white p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-faint">{["一","二","三","四","五","六","日"].map(x=><div key={x}>{x}</div>)}</div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {(mode==="month"?[...Array.from({length:(new Date(y,m-1,1).getDay()+6)%7},()=>null),...monthly]:Array.from({length:7},(_,i)=>addDay(date,i-((new Date(y,m-1,Number(date.slice(-2))).getDay()+6)%7)))).map((d,i)=>
            <button key={d??"empty"+i} type="button" disabled={!d} onClick={()=>{if(d){setDate(d);setMode("day");router.replace("/calendar?view=day&date="+d,{scroll:false});}}}
              className="min-h-[76px] rounded-xl border border-line p-1.5 text-left text-xs hover:bg-sage-50 disabled:border-transparent sm:min-h-[108px]">
              {d&&<><span className="font-medium">{Number(d.slice(-2))}</span><div className="mt-2 space-y-1">{eventsOn(d).slice(0,3).map((e,j)=>
                <div key={e.todoId+j} className="truncate rounded bg-sage-50 px-1 py-0.5 text-[10px] text-sage-700">{new Date(e.start).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} {e.title}</div>)}</div>
                {eventsOn(d).length>3&&<span className="text-[10px] text-ink-faint">+{eventsOn(d).length-3}</span>}
</>}
            </button>)}
        </div>
      </div>}
    </div>}
  </div>;
}
