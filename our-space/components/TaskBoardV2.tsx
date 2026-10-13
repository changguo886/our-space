"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, CheckCircle2, ChevronRight, Plus, X } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import {taskCardVisual,categoryBadgeVisual,normalizeTaskColor} from "@/lib/task-colors";
import AddTodoForm from "@/components/AddTodoForm";
import QuickCaptureTodo from "@/components/QuickCaptureTodo";
import TodayTodoWorkspace from "@/components/TodayTodoWorkspace";
import type { Todo } from "@/components/TodoList";
import { addDaysISO, habitEligible, templateEligible, upcomingEligible, type ExecutionTemplateV3, type HabitPatternV3 } from "@/lib/recurring-execution";

type Filter = "today" | "upcoming" | "backlog" | "completed" | "all";
type Props = {
  todos: Todo[];
  today: string;
  userId: string;
  activeSpaceId: string;
  activeSpaceName: string;
};

const typeLabel: Record<string,string> = {
  one_time: "单次任务",
  recurring: "旧版重复任务",
  habit: "习惯养成",
  routine: "周期任务",
  project: "长期项目",
};

export default function TaskBoardV2({ todos, today, userId, activeSpaceId, activeSpaceName }: Props) {
  const {language} = useI18n();
  const zh = language === "zh-CN";
  const [filter,setFilter] = useState<Filter>("today");
  const [selectedId,setSelectedId] = useState<string | null>(null);
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get("todoId");
    if(requested&&todos.some(t=>t.id===requested))setSelectedId(requested);
  },[]);
  const [creating,setCreating] = useState(false);
  type HabitPattern=HabitPatternV3;
  const [habitPatterns,setHabitPatterns]=useState<Record<string,HabitPattern>>({});
  const [bookedCounts,setBookedCounts]=useState<Record<string,number>>({});
  const [executionTemplates,setExecutionTemplates]=useState<ExecutionTemplateV3[]>([]);
  const [bookedDays,setBookedDays]=useState<Record<string,string[]>>({});
  useEffect(()=>{
    let active=true;
    const db=createClient();
    void Promise.all([
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end"),
      db.from("todo_sessions").select("todo_id,id,scheduled_start,plan_date,mode"),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end")
    ]).then(([p,slots,templateRows])=>{
      if(!active)return;
      if(!p.error)setHabitPatterns(Object.fromEntries(((p.data??[]) as HabitPattern[]).map(pattern=>[pattern.todo_id,pattern])));
      if(!templateRows.error)setExecutionTemplates((templateRows.data??[]) as ExecutionTemplateV3[]);
      if(!slots.error){const counts:Record<string,number>={},days:Record<string,string[]>={};for(const slot of slots.data??[]){
        counts[slot.todo_id]=(counts[slot.todo_id]??0)+1;
        const time=slot.scheduled_start?new Date(slot.scheduled_start):null;
        const day=slot.plan_date??(time?[time.getFullYear(),String(time.getMonth()+1).padStart(2,"0"),String(time.getDate()).padStart(2,"0")].join("-"):null);
        if(!day)continue;
        (days[slot.todo_id]??=[]).push(day);
      }setBookedCounts(counts);setBookedDays(days);}
    });
    return()=>{active=false};
  },[todos]);
  const ruleSummary=(todo:Todo)=>{
    const p=habitPatterns[todo.id];
    if(todo.task_type!=="habit"&&todo.task_type!=="routine"||!p)return "";
    if(p.period==="day")return `每天 ${p.target_count} 次`;
    if(p.period==="week")return p.arrangement==="fixed"?`每周 ${(p.weekdays??[]).map(x=>"一二三四五六日"[x-1]).join("、")}`:`每周 ${p.target_count} 次`;
    return p.arrangement==="fixed"?`每月 ${(p.month_days??[]).join("、")}${p.include_month_end?"、最后一天":""} 日`:`每月 ${p.target_count} 次`;
  };
  const [typeFilter,setTypeFilter] = useState<"all"|"one_time"|"project"|"routine">("all");
  const [categoryFilter,setCategoryFilter] = useState("all");
  const [collapsedCategories,setCollapsedCategories] = useState<string[]>([]);

  const isHabitToday=(t:Todo)=>{
    const p=habitPatterns[t.id];
    return Boolean(p&&habitEligible(today,p,t.task_date??today));
  };
  const templateForDate=(t:Todo,day:string)=>executionTemplates.some(x=>x.todo_id===t.id&&
    templateEligible(day,x,habitPatterns[t.id],t.task_date));
  const hasExecution=(t:Todo)=>Boolean(bookedCounts[t.id]||executionTemplates.some(x=>x.todo_id===t.id));
  const hasFutureTemplate=(t:Todo)=>Array.from({length:120},(_,i)=>addDaysISO(today,i+1))
    .some(day=>templateForDate(t,day));
  const isFutureHabit=(t:Todo)=>{
    const p=habitPatterns[t.id];
    return Boolean(p&&upcomingEligible(p,t.task_date??today,today,370,5).some(day=>day>today));
  };
  const isToday=(t:Todo)=>{
    if((t.task_type==="habit"||t.task_type==="routine"))return isHabitToday(t);
    if(templateForDate(t,today))return true;
    const booked=bookedDays[t.id]??[];
    return booked.length?booked.includes(today):t.task_date===today;
  };
  const isUpcoming=(t:Todo)=>{
    if((t.task_type==="habit"||t.task_type==="routine"))return hasExecution(t)&&isFutureHabit(t);
    if((bookedDays[t.id]??[]).some(day=>day>today)||hasFutureTemplate(t))return true;
    return Boolean(!hasExecution(t)&&t.task_date&&t.task_date>today);
  };
  const buckets:Record<Filter,Todo[]> = {
    today:todos.filter(t=>t.status!=="completed"&&isToday(t)),
    upcoming:todos.filter(t=>t.status!=="completed"&&isUpcoming(t)),
    backlog:todos.filter(t=>t.status!=="completed"&&!hasExecution(t)&&!isToday(t)),
    completed:todos.filter(t=>t.status==="completed"),
    all:todos.filter(t=>t.status!=="completed"),
  };
  const visible = buckets[filter].filter(t=>typeFilter==="all"||(t.task_type??"one_time")===typeFilter).sort((a,b)=>filter==="completed"?(b.completed_at??"").localeCompare(a.completed_at??""):0).slice(0,filter==="completed"?10:undefined);
  const categories: {key:string;label:string}[] = [{key:"work",label:zh?"工作":"Work"},{key:"study",label:zh?"学习":"Study"},{key:"life",label:zh?"生活":"Life"},{key:"rest",label:zh?"休息":"Rest"},{key:"other",label:zh?"其他":"Other"},{key:"none",label:zh?"未分类":"Uncategorized"}];
  const grouped = categories.filter(c=>categoryFilter==="all"||categoryFilter===c.key).map(c=>({ ...c, items:visible.filter(t=>(t.category??"none")===c.key) })).filter(c=>c.items.length>0);
  const selected = todos.find(t=>t.id===selectedId)??null;
  const displayType = (todo:Todo) => zh ? (typeLabel[todo.task_type??"one_time"]??"任务") : ({one_time:"One-time",project:"Project",routine:"Routine",recurring:"Legacy recurring",habit:"Legacy habit"}[todo.task_type??"one_time"]??"Task");
  const tabs: {key:Filter;label:string}[] = [
    {key:"today",label:zh?"今天":"Today"},
    {key:"backlog",label:zh?"待安排":"Unscheduled"},
    {key:"upcoming",label:zh?"即将到来":"Upcoming"},
    {key:"completed",label:zh?"已完成":"Completed"},
    {key:"all",label:zh?"全部":"All"},
  ];

  return (
    <div className="relative mt-6 min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{zh?"我的任务":"My Tasks"}</h1>
          <p className="mt-1 text-xs text-ink-faint">{zh?"先记录，再规划。错过计划不会删除任务。":"Capture first, schedule later. Missed plans never delete tasks."}</p>
        </div>

      </div>

      <div className={selected?"grid min-w-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]":"mx-auto grid min-w-0 max-w-[780px] gap-5"}>
        <section className="min-w-0 rounded-2xl border border-line bg-white/85 p-4 shadow-soft">
          <div className="mb-3 rounded-xl border border-line bg-paper/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-soft">{zh?"快速添加":"Quick capture"}</p>
              <button type="button" onClick={()=>setCreating(true)} className="inline-flex items-center gap-1 rounded-lg border border-sage-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sage-700 hover:bg-sage-50"><Plus className="h-3.5 w-3.5"/> {zh?"创建任务":"Create task"}</button>
            </div>
            <QuickCaptureTodo userId={userId} taskDate={today}/>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-line pb-3" aria-label={zh?"任务分组":"Task groups"}>
            {tabs.map(tab=><button key={tab.key} type="button" aria-pressed={filter===tab.key}
              className={`rounded-lg px-3 py-2 text-xs transition ${filter===tab.key?"bg-sage-100 font-semibold text-sage-700":"text-ink-soft hover:bg-paper"}`}
              onClick={()=>{setFilter(tab.key);setSelectedId(null);}}>{tab.label} <span className="opacity-65">{buckets[tab.key].length}</span></button>)}
          </div>
          <div className="flex items-center justify-between gap-2 py-3">
            <label className="flex min-w-0 items-center gap-2 text-xs text-ink-faint">{zh?"分类":"Category"}
              <select aria-label={zh?"按任务分类筛选":"Filter category"} className="min-w-0 max-w-[145px] rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink-soft" value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setSelectedId(null);}}>
                <option value="all">{zh?"全部分类":"All categories"}</option>
                {categories.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <select aria-label={zh?"任务类型筛选":"Filter task type"} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink-soft" value={typeFilter} onChange={e=>setTypeFilter(e.target.value as typeof typeFilter)}>
              <option value="all">{zh?"全部类型":"All types"}</option><option value="one_time">{zh?"单次任务":"One-time"}</option><option value="project">{zh?"长期项目":"Project"}</option><option value="routine">{zh?"周期任务":"Routine"}</option>
            </select>
          </div>
          <div className="space-y-4">
            {visible.length===0&&<p className="rounded-xl bg-paper/40 p-3 text-sm text-ink-faint">{zh?"这里暂时没有任务。":"No tasks match this view."}</p>}
            {grouped.map(group=><div key={group.key}>
              <button type="button" className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-paper/60" aria-expanded={!collapsedCategories.includes(group.key)} onClick={()=>setCollapsedCategories(current=>current.includes(group.key)?current.filter(k=>k!==group.key):[...current,group.key])}>
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${collapsedCategories.includes(group.key)?"":"rotate-90"}`}/>
                <span className="rounded-full border px-2 py-1 text-xs font-semibold" style={categoryBadgeVisual(group.key)}>{group.label}</span><span className="text-[10px] text-ink-faint">{group.items.length}</span>
              </button>
              {!collapsedCategories.includes(group.key)&&<div className="space-y-1.5">{group.items.map(todo=><button key={todo.id} type="button" onClick={()=>setSelectedId(todo.id)} aria-pressed={selectedId===todo.id}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${selectedId===todo.id?"ring-2 ring-sage-300/40":"hover:brightness-[0.98]"}`} style={taskCardVisual(todo.category,todo.color_hex)}>
                {todo.status==="completed"?<CheckCircle2 className="h-4 w-4 shrink-0 text-sage-600"/>:<span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:normalizeTaskColor(todo.color_hex)}}/>}
                <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${todo.status==="completed"?"text-ink-faint line-through":"text-ink"}`}>{todo.title}</span><span className="block text-[10px] text-ink-faint">{displayType(todo)} · {ruleSummary(todo)|| (todo.target_finish_date?`目标 ${todo.target_finish_date}`:todo.task_date||"待安排")}{(bookedCounts[todo.id]??0)>0?` · 已预约 ${bookedCounts[todo.id]} 段`:""}{executionTemplates.some(x=>x.todo_id===todo.id)? " · 已设置未来重复安排":""}</span></span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint"/>
              </button>)}</div>}
            </div>)}
            {filter==="completed"&&<div className="border-t border-line pt-3 text-center"><p className="mb-2 text-xs text-ink-faint">这里只显示最近 10 项已完成任务。</p><Link href="/history" className="text-xs font-medium text-sage-700 hover:underline">查看完整历史记录 →</Link></div>}
          </div>
        </section>

        {selected&&<section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-faint">{zh?"任务工作区":"Task workspace"}</span>
            <button type="button" onClick={()=>setSelectedId(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-paper"><X className="h-3.5 w-3.5"/> {zh?"关闭详情":"Close details"}</button>
          </div>
          <TodayTodoWorkspace key={selected.id} todayTodos={selected.status==="completed"?[]:[selected]}
            todayCompleted={selected.status==="completed"?[selected]:[]}
            title={selected.title} description={displayType(selected)} showProgress={false}/>
        </section>}
      </div>

      {creating&&<div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={event=>{if(event.target===event.currentTarget)setCreating(false);}}>
        <div role="dialog" aria-modal="true" aria-label={zh?"创建任务":"Create task"} className="flex h-full w-full max-w-[550px] flex-col overflow-hidden bg-[#FCFBF8] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
            <div><h2 className="text-xl font-semibold text-ink">{zh?"创建任务":"Create task"}</h2><p className="mt-1 text-xs text-ink-faint">{zh?"单次任务 · 长期项目 · 周期任务":"One-time · Project · Routine"}</p></div>
            <button type="button" onClick={()=>setCreating(false)} aria-label={zh?"关闭创建面板":"Close create panel"} className="rounded-lg p-2 hover:bg-paper"><X className="h-5 w-5"/></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <p className="mb-4 rounded-xl bg-sage-50 p-3 text-xs text-sage-700"><CalendarDays className="mr-1 inline h-3.5 w-3.5"/> {zh?"先创建任务；需要的话，保存后直接进入执行计划。":"Set up the task here; schedule execution times after creating it."}</p>
            <AddTodoForm userId={userId} activeSpaceId={activeSpaceId} activeSpaceName={activeSpaceName} taskDate={today} onCreated={(id,planNow)=>{setCreating(false);setSelectedId(id);if(planNow){window.location.assign("/todo?todoId="+encodeURIComponent(id)+"&plan=1");}}}/>
          </div>
        </div>
      </div>}
    </div>
  );
}
