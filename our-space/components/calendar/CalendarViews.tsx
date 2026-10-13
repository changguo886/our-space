"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import CalendarPlanner from "@/components/calendar/CalendarPlanner";
import JourneyCalendar from "@/components/JourneyCalendar";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {CATEGORY_VISUALS,taskCardVisual} from "@/lib/task-colors";
import {useI18n} from "@/components/I18nProvider";
import { templateEligible, wallClockISO, type ExecutionTemplateV3, type HabitPatternV3, type ExecutionOverrideV3 } from "@/lib/recurring-execution";

type EventSession = { id:string; scheduled_start:string|null; scheduled_end:string|null; reminder_minutes_before:number|null; mode?:"fixed"|"window"|"flexible"; plan_date?:string|null; planned_minutes?:number|null; window_start?:string|null; window_end?:string|null };
type CalendarTask = { id:string; category?:string|null; color_hex?:string|null; title:string; task_date?:string; task_type?:"one_time"|"project"|"routine"|"recurring"|"habit"; todo_sessions: EventSession[]; scheduled_start:string|null; scheduled_end:string|null };
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
  const {language}=useI18n(); const zh=language==="zh-CN";
  const [categoryFilter,setCategoryFilter]=useState("all");
  const queryMode=params.get("view");const requested=queryMode==="journey"||queryMode==="month"||queryMode==="week"?"journey"===queryMode?"journey":queryMode:"day";
  const [mode,setMode]=useState<Mode>(requested);
  const [date,setDate]=useState(params.get("date")?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]??initialDate);
  const [journeys,setJourneys]=useState<JourneyRow[]>([]);
  const [selectedTodo,setSelectedTodo]=useState(params.get("todoId")??"");
  const [loadError,setLoadError]=useState("");
  const [patterns,setPatterns]=useState<Record<string,HabitPatternV3>>({});
  const [templates,setTemplates]=useState<ExecutionTemplateV3[]>([]);
  const [overrides,setOverrides]=useState<ExecutionOverrideV3[]>([]);
  const [pickedEvent,setPickedEvent]=useState<{todoId:string;title:string;start:string;end:string;sessionId?:string;virtualId?:string}|null>(null);
  const [actionBusy,setActionBusy]=useState(false);
  const [editingPicked,setEditingPicked]=useState(false);
  const [pickedStart,setPickedStart]=useState("09:00");
  const [pickedEnd,setPickedEnd]=useState("10:00");
  useEffect(()=>{
    let live=true;const db=createClient();
    void Promise.all([
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end"),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end,replaces_slot_key"),
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
  const eventVisual=(todoId:string)=>{const task=tasks.find(t=>t.id===todoId);return taskCardVisual(task?.category,task?.color_hex);};
  // A dated one-off schedule takes precedence over virtual recurring defaults
  // for that todo and day. It is not a completion and no override rows are fabricated.
  // An individual plan only replaces the matching virtual slot. A whole-day
  // suppression would hide independent morning/evening recurring executions.
  const hasOneOffPlan=(template:ExecutionTemplateV3,day:string)=>{
    const todo=tasks.find(t=>t.id===template.todo_id);
    return (todo?.todo_sessions??[]).some(session=>{
      if(template.execution_mode==="fixed"){
        if(!session.scheduled_start||!inDay(session.scheduled_start,day))return false;
        const local=new Date(session.scheduled_start);
        const start=String(local.getHours()).padStart(2,"0")+":"+String(local.getMinutes()).padStart(2,"0");
        return start===template.start_time?.slice(0,5);
      }
      return session.mode===template.execution_mode&&session.plan_date===day&&
        (template.execution_mode==="flexible"||(
          session.window_start?.slice(0,5)===template.window_start?.slice(0,5)&&
          session.window_end?.slice(0,5)===template.window_end?.slice(0,5)));
    });
  };
  const sessions=tasks.flatMap(todo=>[...(todo.todo_sessions??[]).filter(s=>s.scheduled_start&&s.scheduled_end).map(s=>({todoId:todo.id,title:todo.title,start:s.scheduled_start!,end:s.scheduled_end!,sessionId:s.id})),
    ...(todo.todo_sessions?.some(s=>s.scheduled_start&&s.scheduled_end)?[]:todo.scheduled_start&&todo.scheduled_end?[{todoId:todo.id,title:todo.title,start:todo.scheduled_start,end:todo.scheduled_end}]:[])]);
  function recurringEvents(d:string){
    const active=templates.filter(t=>tasks.some(todo=>todo.id===t.todo_id)&&
      templateEligible(d,t,patterns[t.todo_id],tasks.find(x=>x.id===t.todo_id)?.task_date)&&!hasOneOffPlan(t,d));
    const effective=active.filter(t=>{
      if(t.selector_kind==="all"&&active.some(other=>other.todo_id===t.todo_id&&other.replaces_slot_key===t.slot_key)){
        // A specific weekday/month-day preset replaces this generic slot.
        return overrides.some(o=>o.todo_id===t.todo_id&&o.slot_key===t.slot_key&&o.occurrence_date===d);
      }
      if(t.replaces_slot_key&&overrides.some(o=>o.todo_id===t.todo_id&&o.slot_key===t.replaces_slot_key&&o.occurrence_date===d)){
        // A one-off override of the base slot takes precedence over its day preset.
        return false;
      }
      return true;
    });
    return effective.filter(t=>t.execution_mode==="fixed"&&t.start_time&&t.end_time).flatMap(t=>{
      const change=overrides.find(x=>x.todo_id===t.todo_id&&x.slot_key===t.slot_key&&x.occurrence_date===d);
      if(change?.action==="cancel")return [];
      const title=tasks.find(x=>x.id===t.todo_id)?.title??"任务";
      if(change?.action==="reschedule"&&change.scheduled_start&&change.scheduled_end){
        return inDay(change.scheduled_start,d)?[{todoId:t.todo_id,virtualId:"virtual:"+t.todo_id+":"+t.slot_key+":"+d,title:title+"（已调整）",start:change.scheduled_start,end:change.scheduled_end}]:[];
      }
      const start=wallClockISO(d,t.start_time!,t.timezone);
      const end=wallClockISO(d,t.end_time!,t.timezone);
      if(!start||!end||end<=start)return [];
      return [{todoId:t.todo_id,virtualId:"virtual:"+t.todo_id+":"+t.slot_key+":"+d,title:title+"（重复）",start,end}];
    });
  }
  function movedOverrideEvents(d:string){
    return overrides.filter(o=>o.action==="reschedule"&&o.scheduled_start&&o.occurrence_date!==d&&inDay(o.scheduled_start,d)
      &&templates.some(t=>t.todo_id===o.todo_id&&t.slot_key===o.slot_key)&&tasks.some(t=>t.id===o.todo_id)).map(o=>({
      todoId:o.todo_id,virtualId:"virtual:"+o.todo_id+":"+o.slot_key+":"+o.occurrence_date,title:(tasks.find(t=>t.id===o.todo_id)?.title??"任务")+"（单次改期）",
      start:o.scheduled_start!,end:o.scheduled_end!
    }));
  }
  function eventsOn(d:string){return [...sessions.filter(s=>inDay(s.start,d)),...recurringEvents(d),...movedOverrideEvents(d)].filter(e=>categoryFilter==="all"||(tasks.find(t=>t.id===e.todoId)?.category??"none")===categoryFilter);}
  async function updatePicked(){
    if(!pickedEvent||(!pickedEvent.sessionId&&!pickedEvent.virtualId))return;
    if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(pickedStart)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(pickedEnd)||pickedEnd<=pickedStart){setLoadError(zh?"请填写有效的同日时间段。":"Enter a valid same-day time range.");return;}
    const day=new Date(pickedEvent.start);
    const occurrence=pickedEvent.virtualId?.split(":")[3];
    const localDay=occurrence??dateOf(day.getFullYear(),day.getMonth(),day.getDate());
    const start=new Date(localDay+"T"+pickedStart+":00"),end=new Date(localDay+"T"+pickedEnd+":00");
    if(localDay<dateOf(new Date().getFullYear(),new Date().getMonth(),new Date().getDate())){setLoadError(zh?"不能修改过去的执行安排。":"Past sessions are read-only.");return;}
    const overlap=tasks.some(t=>t.id===pickedEvent.todoId&&(t.todo_sessions??[]).some(existing=>existing.id!==pickedEvent.sessionId&&existing.scheduled_start&&existing.scheduled_end&&start.getTime()<new Date(existing.scheduled_end).getTime()&&end.getTime()>new Date(existing.scheduled_start).getTime()));
    if(overlap){setLoadError(zh?"新时间与同任务的其他固定安排重叠。":"This change overlaps another fixed session for the same task.");return;}
    const db=createClient();
    if(pickedEvent.virtualId&&!pickedEvent.sessionId){
      const slot=pickedEvent.virtualId.split(":")[2];
      if(!templates.some(t=>t.todo_id===pickedEvent.todoId&&t.slot_key===slot)){setLoadError(zh?"未找到此重复计划。":"Recurring slot not found.");return;}
      setActionBusy(true);setLoadError("");
      const result=await db.from("todo_execution_overrides").upsert({todo_id:pickedEvent.todoId,slot_key:slot,occurrence_date:localDay,action:"reschedule",scheduled_start:start.toISOString(),scheduled_end:end.toISOString()},{onConflict:"todo_id,slot_key,occurrence_date"});
      setActionBusy(false);
      if(result.error){setLoadError(result.error.message);return;}
      setOverrides(current=>[...current.filter(x=>!(x.todo_id===pickedEvent.todoId&&x.slot_key===slot&&x.occurrence_date===localDay)),{todo_id:pickedEvent.todoId,slot_key:slot,occurrence_date:localDay,action:"reschedule",scheduled_start:start.toISOString(),scheduled_end:end.toISOString()}]);
      setPickedEvent(null);setEditingPicked(false);router.refresh();return;
    }
    const fresh=await db.from("todo_sessions").select("id,scheduled_start,scheduled_end").eq("todo_id",pickedEvent.todoId).eq("mode","fixed");
    if(fresh.error){setLoadError(fresh.error.message);return;}
    if((fresh.data??[]).some(other=>other.id!==pickedEvent.sessionId&&other.scheduled_start&&other.scheduled_end&&start.getTime()<new Date(other.scheduled_end).getTime()&&end.getTime()>new Date(other.scheduled_start).getTime())){setLoadError(zh?"该任务已有重叠的预约，请调整时间。":"Another session for this task overlaps.");return;}
    setActionBusy(true);setLoadError("");
    const result=await db.from("todo_sessions").update({scheduled_start:start.toISOString(),scheduled_end:end.toISOString()}).eq("id",pickedEvent.sessionId).eq("todo_id",pickedEvent.todoId);
    setActionBusy(false);
    if(result.error){setLoadError(result.error.message);return;}
    setPickedEvent(null);setEditingPicked(false);router.refresh();
  }
  async function cancelPicked(allFuture:boolean){
    if(!pickedEvent)return;
    const chosen=pickedEvent;
    const segments=chosen.virtualId?.split(":");
    const slot=segments?.[2],occurrence=segments?.[3];
    const template=slot?templates.find(t=>t.todo_id===chosen.todoId&&t.slot_key===slot):undefined;
    const message=allFuture
      ?(zh?"从所选日期起停止这条重复安排？历史记录不会删除。":"Stop this recurring schedule from this date? History remains.")
      :(zh?"仅取消这一次时间安排？任务和完成记录仍然保留。":"Cancel this occurrence only? The task and completion records remain.");
    if(!window.confirm(message))return;
    setActionBusy(true);setLoadError("");
    const db=createClient();
    let error:string|undefined;
    if(template&&occurrence){
      if(allFuture){const result=await db.rpc("stop_execution_template_future_v3",{p_template_id:template.id,p_effective_on:occurrence});error=result.error?.message;}
      else {const result=await db.from("todo_execution_overrides").upsert({todo_id:chosen.todoId,slot_key:slot,occurrence_date:occurrence,action:"cancel",scheduled_start:null,scheduled_end:null},{onConflict:"todo_id,slot_key,occurrence_date"});error=result.error?.message;}
    }else if(chosen.sessionId&&!allFuture){
      const result=await db.from("todo_sessions").delete().eq("id",chosen.sessionId).eq("todo_id",chosen.todoId);error=result.error?.message;
    }else error=zh?"此安排不支持该操作，请进入任务工作区管理。":"Manage this plan from its Todo workspace.";
    setActionBusy(false);
    if(error){setLoadError(error);return;}
    setPickedEvent(null);router.refresh();
    if(template&&slot&&occurrence){
      if(allFuture)setTemplates(current=>current.map(t=>t.id===template.id?{...t,ends_on:addDay(occurrence,-1)}:t));
      else setOverrides(current=>[...current.filter(o=>!(o.todo_id===chosen.todoId&&o.slot_key===slot&&o.occurrence_date===occurrence)),{todo_id:chosen.todoId,slot_key:slot,occurrence_date:occurrence,action:"cancel",scheduled_start:null,scheduled_end:null}]);
    }
  }
  const dailyPlans=tasks.flatMap(todo=>(todo.todo_sessions??[]).filter(s=>s.plan_date===date&&s.mode!=="fixed").map(s=>({
    id:s.id,todo_id:todo.id,title:todo.title,category:todo.category??null,color_hex:todo.color_hex??null,
    mode:s.mode??"flexible",planned_minutes:s.planned_minutes??0,
    window_start:s.window_start??null,window_end:s.window_end??null
  })));
  const matchingPlanTemplates=templates.filter(t=>t.execution_mode!=="fixed"&&tasks.some(todo=>todo.id===t.todo_id)
      &&templateEligible(date,t,patterns[t.todo_id],tasks.find(x=>x.id===t.todo_id)?.task_date)&&!hasOneOffPlan(t,date)
      &&!overrides.some(o=>o.todo_id===t.todo_id&&o.slot_key===t.slot_key&&o.occurrence_date===date&&o.action==="cancel"));
  const recurringPlans=matchingPlanTemplates.filter(t=>!(t.selector_kind==="all"&&matchingPlanTemplates.some(other=>
      other.todo_id===t.todo_id&&other.replaces_slot_key===t.slot_key)))
    .map(t=>({id:"template:"+t.slot_key+":"+date,todo_id:t.todo_id,title:tasks.find(x=>x.id===t.todo_id)?.title??"Task",
      category:tasks.find(x=>x.id===t.todo_id)?.category??null,color_hex:tasks.find(x=>x.id===t.todo_id)?.color_hex??null,
      mode:t.execution_mode,planned_minutes:t.planned_minutes??0,
      window_start:t.window_start??null,window_end:t.window_end??null}));
  const allDailyPlans=[...dailyPlans,...recurringPlans];
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
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={zh?"类别筛选":"Category filter"}>
      {["all","work","study","life","rest","other","none"].map(key=><button key={key} type="button" aria-pressed={categoryFilter===key} onClick={()=>setCategoryFilter(key)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${categoryFilter===key?"font-semibold ring-1 ring-ink/15":"hover:brightness-95"}`} style={key==="all"?{backgroundColor:categoryFilter===key?"#E8F1E8":"#FFFFFF",borderColor:"#D8DDD6"}:{backgroundColor:CATEGORY_VISUALS[key].background,borderColor:CATEGORY_VISUALS[key].border}}>
      {key!=="all"&&<span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:CATEGORY_VISUALS[key].accent}}/>}{key==="all"?(zh?"全部":"All"):(zh?CATEGORY_VISUALS[key].labelZh:CATEGORY_VISUALS[key].labelEn)}</button>)}
    </div>
    {mode==="day" ? <div className="space-y-3">
      <CalendarPlanner key={categoryFilter+"-"+date} windowPlans={allDailyPlans.filter(p=>categoryFilter==="all"||(p.category??"none")===categoryFilter)} initialTodos={initialTodos.filter(t=>categoryFilter==="all"||(t.category??"none")===categoryFilter)} initialDate={date} onDateChange={setDate}
        virtualSessions={[...recurringEvents(date),...movedOverrideEvents(date)].filter(e=>categoryFilter==="all"||(tasks.find(t=>t.id===e.todoId)?.category??"none")===categoryFilter).map(e=>({
          todo_id:e.todoId,id:e.virtualId,
          scheduled_start:e.start,scheduled_end:e.end,
        }))}/>
      {(recurringEvents(date).length+movedOverrideEvents(date).length)>0&&<section className="rounded-xl border border-line bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-ink-soft">重复固定时段（预览，不创建独立预约）</p>
        {[...recurringEvents(date),...movedOverrideEvents(date)].map((e,i)=><div key={e.todoId+i} className="mb-1 rounded-lg border border-l-4 px-3 py-2 text-xs text-ink" style={eventVisual(e.todoId)}>{e.start.slice(11,16)}–{e.end.slice(11,16)} · {e.title} <Link href={"/todo?todoId="+encodeURIComponent(e.todoId)} className="underline">调整安排</Link></div>)}
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
                <span key={e.todoId+j} role="button" tabIndex={0} onClick={event=>{event.stopPropagation();setPickedEvent(e);setEditingPicked(false);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setPickedEvent(e);}}} className="block cursor-pointer truncate rounded-md border border-l-4 px-1.5 py-1 text-[10px] font-medium text-ink hover:ring-2 hover:ring-sage-300" style={eventVisual(e.todoId)}>{new Date(e.start).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} {e.title}</span>)}</div>
                {eventsOn(d).length>3&&<span className="text-[10px] text-ink-faint">+{eventsOn(d).length-3}</span>}
</>}
            </button>)}
        </div>
      </div>}
    </div>}
    {pickedEvent&&<div role="dialog" aria-modal="true" aria-label={zh?"管理执行安排":"Manage appointment"} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-ink">{pickedEvent.title}</h3><p className="text-xs text-ink-soft">{new Date(pickedEvent.start).toLocaleString()} – {new Date(pickedEvent.end).toLocaleTimeString()}</p></div><button type="button" onClick={()=>setPickedEvent(null)} aria-label={zh?"关闭":"Close"}>✕</button></div>
        {(pickedEvent.sessionId||pickedEvent.virtualId)&&<button type="button" disabled={actionBusy} className="w-full rounded-lg border border-line p-3 text-left text-sm" onClick={()=>{const a=new Date(pickedEvent.start),b=new Date(pickedEvent.end);setPickedStart(String(a.getHours()).padStart(2,"0")+":"+String(a.getMinutes()).padStart(2,"0"));setPickedEnd(String(b.getHours()).padStart(2,"0")+":"+String(b.getMinutes()).padStart(2,"0"));setEditingPicked(v=>!v);}}>{zh?"修改本次时间":"Edit this occurrence"}</button>}
        {editingPicked&&<div className="space-y-2 rounded-lg border border-line p-3"><div className="grid grid-cols-2 gap-2"><label className="text-xs">{zh?"开始":"Start"}<input type="time" value={pickedStart} onChange={e=>setPickedStart(e.target.value)} className="w-full rounded-lg border border-line p-2"/></label><label className="text-xs">{zh?"结束":"End"}<input type="time" value={pickedEnd} onChange={e=>setPickedEnd(e.target.value)} className="w-full rounded-lg border border-line p-2"/></label></div><button type="button" disabled={actionBusy} className="btn-primary w-full" onClick={()=>void updatePicked()}>{zh?"保存本次修改":"Save occurrence"}</button></div>}
        <Link href={"/todo?todoId="+encodeURIComponent(pickedEvent.todoId)} className="block rounded-lg border border-line p-3 text-sm">{zh?"进入任务工作区 · 修改时间":"Open Todo workspace · change time"}</Link>
        {(pickedEvent.sessionId||pickedEvent.virtualId)&&<button disabled={actionBusy} type="button" onClick={()=>void cancelPicked(false)} className="w-full rounded-lg border border-blush-200 p-3 text-left text-sm text-blush-500">{zh?"取消这一次安排（需确认）":"Cancel this occurrence (confirm)"}</button>}
        {pickedEvent.virtualId&&<button disabled={actionBusy} type="button" onClick={()=>void cancelPicked(true)} className="w-full rounded-lg border border-blush-200 p-3 text-left text-sm text-blush-500">{zh?"停止从这次起的重复安排（需确认）":"Stop future recurrence (confirm)"}</button>}
        <p className="text-xs text-ink-faint">{zh?"永久删除任务及其所有数据请前往 Todo 工作区，勿与取消日程混淆。":"Permanently deleting a task is managed separately in Todo."}</p>
        {loadError&&<p role="alert" className="text-xs text-blush-500">{loadError}</p>}
      </div>
    </div>}
  </div>;
}
