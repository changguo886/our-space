"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, Plus, X } from "lucide-react";
import Link from "next/link";
import AddTodoForm from "@/components/AddTodoForm";
import QuickCaptureTodo from "@/components/QuickCaptureTodo";
import TodayTodoWorkspace from "@/components/TodayTodoWorkspace";
import type { Todo } from "@/components/TodoList";

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
};

export default function TaskBoardV2({ todos, today, userId, activeSpaceId, activeSpaceName }: Props) {
  const [filter,setFilter] = useState<Filter>("today");
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [creating,setCreating] = useState(false);
  const [typeFilter,setTypeFilter] = useState<"all"|"one_time"|"recurring"|"habit">("all");

  const buckets = useMemo(() => ({
    today: todos.filter(t=>t.task_date===today&&t.status!=="completed"),
    upcoming: todos.filter(t=>!!t.task_date&&t.task_date>today&&t.status!=="completed"),
    backlog: todos.filter(t=>(!t.task_date||t.task_date<today)&&t.status!=="completed"),
    completed: todos.filter(t=>t.status==="completed"),
    all: todos.filter(t=>t.status!=="completed"),
  }),[todos,today]);
  const visible = buckets[filter].filter(t=>typeFilter==="all"||(t.task_type??"one_time")===typeFilter).sort((a,b)=>filter==="completed"?(b.completed_at??"").localeCompare(a.completed_at??""):0).slice(0,filter==="completed"?10:undefined);
  const categories: {key:string;label:string}[] = [{key:"work",label:"工作"},{key:"study",label:"学习"},{key:"life",label:"生活"},{key:"rest",label:"休息"},{key:"other",label:"其他"},{key:"none",label:"未分类"}];
  const grouped = categories.map(c=>({ ...c, items:visible.filter(t=>(t.category??"none")===c.key) })).filter(c=>c.items.length>0);
  const selected = todos.find(t=>t.id===selectedId)??null;
  const tabs: {key:Filter;label:string}[] = [
    {key:"today",label:"今天"},
    {key:"backlog",label:"待安排 / 过期"},
    {key:"upcoming",label:"即将到来"},
    {key:"completed",label:"已完成"},
    {key:"all",label:"全部"},
  ];

  return (
    <div className="relative mt-6 min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">我的任务</h1>
          <p className="mt-1 text-xs text-ink-faint">先记录，再规划。任务不会因为错过计划而消失。</p>
        </div>
        <button type="button" onClick={()=>setCreating(true)} className="btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4"/> 新任务
        </button>
      </div>

      <div className={selected?"grid min-w-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]":"mx-auto grid min-w-0 max-w-[780px] gap-5"}>
        <section className="min-w-0 rounded-2xl border border-line bg-white/85 p-4 shadow-soft">
          <div className="mb-3"><QuickCaptureTodo userId={userId} taskDate={today}/></div>
          <div className="flex flex-wrap gap-1 border-b border-line pb-3" aria-label="任务分组">
            {tabs.map(tab=><button key={tab.key} type="button" aria-pressed={filter===tab.key}
              className={`rounded-lg px-3 py-2 text-xs transition ${filter===tab.key?"bg-sage-100 font-semibold text-sage-700":"text-ink-soft hover:bg-paper"}`}
              onClick={()=>{setFilter(tab.key);setSelectedId(null);}}>{tab.label} <span className="opacity-65">{buckets[tab.key].length}</span></button>)}
          </div>
          <div className="flex items-center justify-between gap-2 py-3">
            <span className="text-xs text-ink-faint">按分类查看</span>
            <select aria-label="任务类型筛选" className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink-soft" value={typeFilter} onChange={e=>setTypeFilter(e.target.value as typeof typeFilter)}>
              <option value="all">全部类型</option><option value="one_time">单次任务</option><option value="recurring">旧版重复任务</option><option value="habit">习惯养成</option>
            </select>
          </div>
          <div className="space-y-4">
            {visible.length===0&&<p className="rounded-xl bg-paper/40 p-3 text-sm text-ink-faint">这里暂时没有任务。</p>}
            {grouped.map(group=><div key={group.key}>
              <div className="mb-1.5 flex items-center gap-2 px-1"><h3 className="text-xs font-semibold text-ink-soft">{group.label}</h3><span className="text-[10px] text-ink-faint">{group.items.length}</span></div>
              <div className="space-y-1.5">{group.items.map(todo=><button key={todo.id} type="button" onClick={()=>setSelectedId(todo.id)} aria-pressed={selectedId===todo.id}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${selectedId===todo.id?"border-sage-300 bg-sage-50":"border-line/70 bg-white hover:bg-paper/50"}`}>
                {todo.status==="completed"?<CheckCircle2 className="h-4 w-4 shrink-0 text-sage-600"/>:<span className={`h-2 w-2 shrink-0 rounded-full ${todo.task_type==="habit"?"bg-emerald-400":todo.task_type==="recurring"?"bg-amber-400":"bg-mist-300"}`}/>}
                <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${todo.status==="completed"?"text-ink-faint line-through":"text-ink"}`}>{todo.title}</span><span className="block text-[10px] text-ink-faint">{typeLabel[todo.task_type??"one_time"]} · {todo.task_date||"待安排"}</span></span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint"/>
              </button>)}</div>
            </div>)}
            {filter==="completed"&&<div className="border-t border-line pt-3 text-center"><p className="mb-2 text-xs text-ink-faint">这里只显示最近 10 项已完成任务。</p><Link href="/history" className="text-xs font-medium text-sage-700 hover:underline">查看完整历史记录 →</Link></div>}
          </div>
        </section>

        {selected&&<section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-faint">任务工作区</span>
            <button type="button" onClick={()=>setSelectedId(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-paper"><X className="h-3.5 w-3.5"/> 关闭详情</button>
          </div>
          <TodayTodoWorkspace key={selected.id} todayTodos={selected.status==="completed"?[]:[selected]}
            todayCompleted={selected.status==="completed"?[selected]:[]}
            title={selected.title} description={typeLabel[selected.task_type??"one_time"]} showProgress={false}/>
        </section>}
      </div>

      {creating&&<div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={event=>{if(event.target===event.currentTarget)setCreating(false);}}>
        <div role="dialog" aria-modal="true" aria-label="创建任务" className="flex h-full w-full max-w-[550px] flex-col overflow-hidden bg-[#FCFBF8] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
            <div><h2 className="text-xl font-semibold text-ink">添加任务</h2><p className="mt-1 text-xs text-ink-faint">单次任务 · 定期任务 · 习惯养成</p></div>
            <button type="button" onClick={()=>setCreating(false)} aria-label="关闭创建面板" className="rounded-lg p-2 hover:bg-paper"><X className="h-5 w-5"/></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <p className="mb-4 rounded-xl bg-sage-50 p-3 text-xs text-sage-700"><CalendarDays className="mr-1 inline h-3.5 w-3.5"/> 简单的事可以直接使用左侧快速添加；这里只在需要规划时填写更多信息。</p>
            <AddTodoForm userId={userId} activeSpaceId={activeSpaceId} activeSpaceName={activeSpaceName} taskDate={today} onCreated={()=>setCreating(false)}/>
          </div>
        </div>
      </div>}
    </div>
  );
}
