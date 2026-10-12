"use client";

import { useState } from "react";

import {
  Check,
  Circle,
  Play,
  Pencil,
  Trash2,
  X,
  Save,
  Clock3,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import DurationInput, {
  durationValueToMinutes,
  type DurationUnit,
} from "@/components/DurationInput";

import TodoSubtasks, {
  type TodoSubtask,
} from "@/components/TodoSubtasks";


/* =========================================================
   Types
========================================================= */

export type TodoCategory =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";


export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  estimated_minutes: number | null;
  status: string;
  group_id: string | null;
  task_date?: string;
  started_at?: string | null;
  elapsed_seconds?: number;
  completed_at?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  category?: TodoCategory | null;
  custom_tag?: string | null;
  task_type?: "one_time" | "recurring" | "habit" | null;
  plan_start_date?: string | null;
  target_finish_date?: string | null;
  deadline_date?: string | null;
};


export type TodoNotesOpenPayload = {
  todoId: string;
  todoTitle: string;
  targetSubtaskId?: string | null;
};


type TodoListProps = {
  todos: Todo[];

  /*
   * 打开右侧 Quick Notes Panel。
   */
  onOpenNotes?: (
    payload: TodoNotesOpenPayload
  ) => void;

  /*
   * 关键：把某个 Todo 最新的 subtasks 往更高层同步。
   *
   * TodayTodoWorkspace 会保存这些数据，
   * 再直接传给右侧 QuickNotes。
   */
  onSubtasksChange?: (
    todoId: string,
    subtasks: TodoSubtask[]
  ) => void;
};


/* =========================================================
   Category UI config
========================================================= */

const CATEGORIES: {
  value: TodoCategory;
  selectedClass: string;
  badgeClass: string;
}[] = [
  {
    value: "work",
    selectedClass:
      "border-mist-500 bg-mist-100 text-mist-500",
    badgeClass:
      "bg-mist-100 text-mist-500",
  },
  {
    value: "study",
    selectedClass:
      "border-sage-500 bg-sage-100 text-sage-700",
    badgeClass:
      "bg-sage-100 text-sage-700",
  },
  {
    value: "life",
    selectedClass:
      "border-amber-300 bg-amber-50 text-amber-700",
    badgeClass:
      "bg-amber-50 text-amber-700",
  },
  {
    value: "rest",
    selectedClass:
      "border-blush-500 bg-blush-100 text-blush-500",
    badgeClass:
      "bg-blush-100 text-blush-500",
  },
  {
    value: "other",
    selectedClass:
      "border-ink-faint bg-black/[0.04] text-ink-soft",
    badgeClass:
      "bg-black/[0.04] text-ink-soft",
  },
];


function toLocalInputValue(
  iso?: string | null
) {
  if (!iso) return "";

  const date =
    new Date(iso);

  const offset =
    date.getTimezoneOffset() *
    60000;

  return new Date(
    date.getTime() - offset
  )
    .toISOString()
    .slice(0, 16);
}


function formatScheduledTime(
  start: string | null | undefined,
  end: string | null | undefined,
  language: "zh-CN" | "en",
  nextDayLabel: string
) {
  if (!start) return null;

  const formatter =
    new Intl.DateTimeFormat(
      language === "zh-CN"
        ? "zh-CN"
        : "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );

  const startDate =
    new Date(start);

  const startText =
    formatter.format(
      startDate
    );

  if (!end) {
    return startText;
  }

  const endDate =
    new Date(end);

  const endText =
    formatter.format(
      endDate
    );

  const sameDay =
    startDate.getFullYear() ===
      endDate.getFullYear() &&
    startDate.getMonth() ===
      endDate.getMonth() &&
    startDate.getDate() ===
      endDate.getDate();

  return sameDay
    ? `${startText} – ${endText}`
    : `${startText} – ${endText} ${nextDayLabel}`;
}


function statusInfo(
  status: string,
  labels: {
    running: string;
    paused: string;
    completed: string;
    pending: string;
  }
) {
  switch (status) {
    case "running":
      return {
        label: labels.running,
        className:
          "bg-sage-100 text-sage-700",
      };

    case "paused":
      return {
        label: labels.paused,
        className:
          "bg-amber-50 text-amber-700",
      };

    case "completed":
      return {
        label: labels.completed,
        className:
          "bg-mist-100 text-mist-500",
      };

    default:
      return {
        label: labels.pending,
        className:
          "bg-black/[0.04] text-ink-faint",
      };
  }
}


function categoryInfo(
  category: TodoCategory | null | undefined,
  customTag: string | null | undefined,
  labels: Record<TodoCategory, string>
) {
  if (!category) {
    return null;
  }

  const config =
    CATEGORIES.find(
      (item) =>
        item.value === category
    );

  if (!config) {
    return null;
  }

  return {
    label:
      category === "other" &&
      customTag?.trim()
        ? customTag.trim()
        : labels[category],

    className:
      config.badgeClass,
  };
}


/* =========================================================
   Main component
========================================================= */

export default function TodoList({
  todos,
  onOpenNotes,
  onSubtasksChange,
}: TodoListProps) {
  const router =
    useRouter();

  const {
    dictionary,
    language,
  } = useI18n();

  const t =
    dictionary.todo;

  const common =
    dictionary.common;

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(null);

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    editDescription,
    setEditDescription,
  ] = useState("");

  const [
    editMinutes,
    setEditMinutes,
  ] = useState("");

  const [
    editDurationUnit,
    setEditDurationUnit,
  ] =
    useState<DurationUnit>(
      "minute"
    );

  const [
    editCategory,
    setEditCategory,
  ] =
    useState<TodoCategory | null>(
      null
    );

  const [
    editCustomTag,
    setEditCustomTag,
  ] = useState("");

  const [
    editScheduledStart,
    setEditScheduledStart,
  ] = useState("");

  const [
    editScheduledEnd,
    setEditScheduledEnd,
  ] = useState("");

  const [editType,setEditType]=useState<"one_time"|"planned"|"habit">("one_time");
  const [editPlanStart,setEditPlanStart]=useState("");
  const [editTargetFinish,setEditTargetFinish]=useState("");
  const [editDeadline,setEditDeadline]=useState("");
  const [editingSessionId,setEditingSessionId]=useState<string|null>(null);
  const [editRuleId,setEditRuleId]=useState<string|null>(null);
  const [editHabitPeriod,setEditHabitPeriod]=useState<"day"|"week"|"month">("week");
  const [editHabitMode,setEditHabitMode]=useState<"flexible"|"fixed">("flexible");
  const [editMonthDays,setEditMonthDays]=useState<number[]>([]);
  const [editMonthEnd,setEditMonthEnd]=useState(false);
  const [editHabitLoaded,setEditHabitLoaded]=useState(false);
  const [editRuleCadence,setEditRuleCadence]=useState<"daily"|"weekly_days"|"weekly_quota">("daily");
  const [editRuleWeekdays,setEditRuleWeekdays]=useState<number[]>([]);
  const [editRuleQuota,setEditRuleQuota]=useState(3);
  const [editRuleEnd,setEditRuleEnd]=useState("");
  const [editRuleStatus,setEditRuleStatus]=useState<"active"|"paused"|"stopped">("active");

  const [
    busyId,
    setBusyId,
  ] = useState<string | null>(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  /*
   * 当前只展开一个 Todo 的 checklist。
   */
  const [
    expandedSubtasksId,
    setExpandedSubtasksId,
  ] = useState<string | null>(null);


  function toggleSubtasks(
    todoId: string
  ) {
    setExpandedSubtasksId(
      (current) =>
        current === todoId
          ? null
          : todoId
    );
  }


  /* =======================================================
     Todo status
  ======================================================= */

  async function toggleTodo(
    todo: Todo
  ) {
    if (busyId) return;

    setBusyId(todo.id);
    setError(null);

    const supabase =
      createClient();

    const completed =
      todo.status ===
      "completed";

    if(originalType==="habit"){
      if(!editHabitLoaded){setBusyId(null);setError("习惯规则尚未载入，不能保存。");return;}
      const fixedWeek=editHabitPeriod==="week"&&editHabitMode==="fixed";
      const fixedMonth=editHabitPeriod==="month"&&editHabitMode==="fixed";
      const count=fixedWeek?editRuleWeekdays.length:fixedMonth?editMonthDays.length+(editMonthEnd?1:0):editRuleQuota;
      if(count<1||!Number.isInteger(count)||(!fixedWeek&&!fixedMonth&&editHabitPeriod==="week"&&count>7)){
        setBusyId(null);setError("请填写有效的习惯次数或固定日期。");return;
      }
      const {error:habitError}=await supabase.rpc("save_habit_v3",{
        edit_id:todoId,
        payload:{
          title:cleanTitle,description:editDescription.trim()||null,task_date:original?.task_date,
          estimated_minutes:parsedMinutes,category:editCategory,
          custom_tag:editCategory==="other"?editCustomTag.trim()||null:null,
          group_id:original?.group_id??null,
          period:editHabitPeriod,arrangement:editHabitPeriod==="day"?"flexible":editHabitMode,
          target_count:count,weekdays:fixedWeek?editRuleWeekdays:[],
          month_days:fixedMonth?editMonthDays:[],include_month_end:fixedMonth&&editMonthEnd,
        },
      });
      if(habitError){setBusyId(null);setError("习惯保存失败："+habitError.message);return;}
    }else{
      const {error}=await supabase.from("todos").update({
        title:cleanTitle,description:editDescription.trim()||null,
        estimated_minutes:parsedMinutes,category:editCategory,
        custom_tag:editCategory==="other"?editCustomTag.trim()||null:null,
        plan_start_date:editType==="planned"?editPlanStart:null,
        target_finish_date:editType==="planned"?editTargetFinish:null,
        deadline_date:editType==="planned"?(editDeadline||null):null,
      }).eq("id",todoId);
      if(error){setBusyId(null);setError(t.saveFailed+error.message);return;}
    }
    setBusyId(null);
    cancelEditing();
    router.refresh();
  }


  /* =======================================================
     Todo delete
  ======================================================= */

  async function deleteTodo(
    todo: Todo
  ) {
    const confirmed =
      window.confirm(
        t.deleteConfirm.replace(
          "{title}",
          todo.title
        )
      );

    if (!confirmed) {
      return;
    }

    setBusyId(todo.id);
    setError(null);

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .delete()
        .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        t.deleteFailed +
          error.message
      );
      return;
    }

    if (
      editingId === todo.id
    ) {
      cancelEditing();
    }

    router.refresh();
  }


  if (todos.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        {t.empty}
      </p>
    );
  }


  return (
    <div className="min-w-0 space-y-2">
      {error && (
        <p className="rounded-xl bg-blush-50 px-3 py-2 text-sm text-blush-500">
          {error}
        </p>
      )}


      {todos.map((todo) => {
        const completed =
          todo.status ===
          "completed";

        const editing =
          editingId === todo.id;

        const busy =
          busyId === todo.id;

        const status =
          statusInfo(
            todo.status,
            {
              running: t.running,
              paused: t.paused,
              completed: t.completed,
              pending: t.pending,
            }
          );

        const category =
          categoryInfo(
            todo.category,
            todo.custom_tag,
            t.categories
          );

        const scheduledTime =
          formatScheduledTime(
            todo.scheduled_start,
            todo.scheduled_end,
            language,
            t.nextDay
          );


        /* =================================================
           Edit card
        ================================================= */

        if (editing) {
          return (
            <div
              key={todo.id}
              className="rounded-2xl border border-sage-300 bg-white p-5 shadow-soft"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-faint">任务详情 · 按需要完善</p>
                    <h3 className="font-semibold text-ink">编辑任务</h3>
                  </div>
                  <button type="button" onClick={cancelEditing} className="rounded-lg p-2 text-ink-faint hover:bg-paper" aria-label="关闭编辑"><X className="h-4 w-4"/></button>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-ink-faint">
                    {t.taskName}
                  </label>

                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) =>
                      setEditTitle(
                        e.target.value
                      )
                    }
                    disabled={busy}
                    autoFocus
                  />
                </div>


                <section className="space-y-3 rounded-xl border border-line p-3">
                  <p className="text-xs font-medium text-ink-soft">任务类型</p>
                  <div className="grid grid-cols-3 gap-2">{([{id:"one_time",label:"单次任务"},{id:"planned",label:"定期任务"},{id:"habit",label:"习惯养成"}] as const).map(option=><button type="button" key={option.id} onClick={()=>setEditType(option.id)} aria-pressed={editType===option.id} className={`rounded-lg border px-2 py-2 text-xs ${editType===option.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
                  {editType==="planned"&&<div className="space-y-2"><label className="block text-xs text-ink-soft">计划开始<input type="date" className="input mt-1 w-full" value={editPlanStart} onChange={e=>setEditPlanStart(e.target.value)}/></label><label className="block text-xs text-ink-soft">目标完成<input type="date" className="input mt-1 w-full" value={editTargetFinish} min={editPlanStart} onChange={e=>setEditTargetFinish(e.target.value)}/></label><label className="block text-xs text-ink-soft">正式截止（可选）<input type="date" className="input mt-1 w-full" value={editDeadline} min={editTargetFinish} onChange={e=>setEditDeadline(e.target.value)}/></label></div>}
                  {editType==="habit"&&todo.task_type!=="habit"&&<p className="text-xs text-amber-700">切换为习惯需要建立习惯规则和目标，此次暂不允许保存该转换。</p>}
                  {todo.task_type==="habit"&&editType!=="habit"&&<p className="text-xs text-amber-700">已有习惯记录不会被删除。此转换暂不可保存。</p>}
                </section>

                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">描述与分类（可选）</summary>
                  <div className="mt-3 space-y-4">
                  <div>
                  <label className="mb-1.5 block text-xs text-ink-faint">
                    {t.taskDetails}
                  </label>

                  <textarea
                    className="input min-h-[100px] w-full resize-y"
                    value={
                      editDescription
                    }
                    onChange={(e) =>
                      setEditDescription(
                        e.target.value
                      )
                    }
                    placeholder={t.detailsPlaceholder}
                    disabled={busy}
                  />
                </div>


                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs text-ink-faint">
                      {t.category}
                    </label>

                    {editCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditCategory(
                            null
                          );
                          setEditCustomTag(
                            ""
                          );
                        }}
                        className="text-[11px] text-ink-faint hover:text-ink-soft"
                      >
                        {common.clear}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(
                      (item) => {
                        const selected =
                          editCategory ===
                          item.value;

                        return (
                          <button
                            key={
                              item.value
                            }
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditCategory(
                                item.value
                              );

                              if (
                                item.value !==
                                "other"
                              ) {
                                setEditCustomTag(
                                  ""
                                );
                              }
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              selected
                                ? item.selectedClass
                                : "border-line bg-white/70 text-ink-soft hover:bg-white"
                            }`}
                          >
                            {t.categories[item.value]}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>


                {editCategory ===
                  "other" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-ink-faint">
                      {t.customTag}
                    </label>

                    <input
                      className="input"
                      placeholder={t.customTagPlaceholder}
                      value={
                        editCustomTag
                      }
                      onChange={(e) =>
                        setEditCustomTag(
                          e.target.value
                        )
                      }
                      disabled={busy}
                    />
                  </div>
                )}


                  </div>
                </details>

                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">预计投入（可选）</summary>
                  <div className="mt-3">
                    <DurationInput value={editMinutes} unit={editDurationUnit} onValueChange={setEditMinutes} onUnitChange={setEditDurationUnit} disabled={busy}/>
                    <p className="mt-2 text-xs text-ink-faint">固定日历时段和灵活执行安排，请在任务工作区的「执行安排」中添加与管理。</p>
                  </div>
                </details>

                {todo.task_type==="habit"&&<details open className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">习惯频率与日期（可修改）</summary>
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs text-ink-soft">统计周期
                      <select className="input mt-1 w-full" value={editHabitPeriod} disabled={busy||!editHabitLoaded} onChange={e=>{const next=e.target.value as typeof editHabitPeriod;setEditHabitPeriod(next);if(next==="day")setEditHabitMode("flexible");}}>
                        <option value="day">每天</option><option value="week">每周</option><option value="month">每月</option>
                      </select>
                    </label>
                    {editHabitPeriod!=="day"&&<div className="grid grid-cols-2 gap-2">
                      {(["flexible","fixed"] as const).map(mode=><button type="button" key={mode} disabled={busy||!editHabitLoaded} aria-pressed={editHabitMode===mode} onClick={()=>setEditHabitMode(mode)} className={`rounded-lg border p-2 text-xs ${editHabitMode===mode?"border-sage-400 bg-sage-50":"border-line"}`}>{mode==="fixed"?"固定日期":"灵活次数"}</button>)}
                    </div>}
                    {(editHabitPeriod==="day"||editHabitMode==="flexible")&&<label className="block text-xs text-ink-soft">{editHabitPeriod==="day"?"每天":editHabitPeriod==="week"?"每周":"每月"}完成次数
                      <input type="number" className="input mt-1 w-full" min={1} max={editHabitPeriod==="week"?7:10000} value={editRuleQuota} disabled={busy||!editHabitLoaded} onChange={e=>setEditRuleQuota(Number(e.target.value))}/>
                    </label>}
                    {editHabitPeriod==="week"&&editHabitMode==="fixed"&&<div className="grid grid-cols-7 gap-1">{["一","二","三","四","五","六","日"].map((d,i)=><button key={d} type="button" disabled={busy||!editHabitLoaded} aria-pressed={editRuleWeekdays.includes(i+1)} onClick={()=>setEditRuleWeekdays(prev=>prev.includes(i+1)?prev.filter(n=>n!==i+1):[...prev,i+1].sort((a,b)=>a-b))} className={`rounded-lg border py-2 text-xs ${editRuleWeekdays.includes(i+1)?"border-sage-400 bg-sage-50":"border-line"}`}>{d}</button>)}</div>}
                    {editHabitPeriod==="month"&&editHabitMode==="fixed"&&<>
                      <div className="grid grid-cols-7 gap-1">{Array.from({length:31},(_,i)=>i+1).map(d=><button key={d} type="button" disabled={busy||!editHabitLoaded} aria-pressed={editMonthDays.includes(d)} onClick={()=>setEditMonthDays(prev=>prev.includes(d)?prev.filter(n=>n!==d):[...prev,d].sort((a,b)=>a-b))} className={`rounded-lg border py-2 text-xs ${editMonthDays.includes(d)?"border-sage-400 bg-sage-50":"border-line"}`}>{d}</button>)}</div>
                      <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={editMonthEnd} onChange={e=>setEditMonthEnd(e.target.checked)} disabled={busy||!editHabitLoaded}/> 每月最后一天</label>
                      <p className="text-xs text-ink-faint">没有对应日期的月份自动跳过；已完成的历史不会重新计算。</p>
                    </>}
                    <p className="text-xs text-ink-faint">修改只更新习惯定义；已记录的打卡和专注历史保留。已有单日预约请到「执行安排」单独管理。</p>
                  </div>
                </details>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={
                      cancelEditing
                    }
                    disabled={busy}
                    className="btn-ghost flex items-center gap-1.5 text-sm"
                  >
                    <X className="h-4 w-4" />
                    {common.cancel}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      saveEdit(todo.id)
                    }
                    disabled={busy}
                    className="btn-primary flex items-center gap-1.5 text-sm"
                  >
                    <Save className="h-4 w-4" />
                    {busy
                      ? common.saving
                      : common.save}
                  </button>
                </div>
              </div>
            </div>
          );
        }


        /* =================================================
           Normal Todo card
        ================================================= */

        return (
          <div
            key={todo.id}
            className="group rounded-2xl border border-line bg-white/50 transition hover:bg-white"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  toggleTodo(todo)
                }
                disabled={busy}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                title={
                  completed
                    ? t.markIncomplete
                    : t.markComplete
                }
              >
                {completed ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <Circle className="h-6 w-6 text-ink-faint" />
                )}
              </button>


              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={
                      completed
                        ? "truncate text-sm text-ink-faint line-through"
                        : "truncate text-sm font-medium text-ink"
                    }
                  >
                    {todo.title}
                  </p>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-ink-soft">{todo.task_type==="habit"?"习惯":todo.task_type==="recurring"?"重复":"单次"}</span>

                  {category && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${category.className}`}
                    >
                      {category.label}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>


                {todo.description && (
                  <p
                    className={`mt-1 line-clamp-2 text-xs leading-relaxed ${
                      completed
                        ? "text-ink-faint"
                        : "text-ink-soft"
                    }`}
                  >
                    {todo.description}
                  </p>
                )}


                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                  {todo.estimated_minutes && (
                    <span>
                      {t.estimatedShort}{" "}
                      {todo.estimated_minutes}{" "}
                      {common.minutes}
                    </span>
                  )}

                  {scheduledTime && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {scheduledTime}
                    </span>
                  )}

                  {!scheduledTime &&
                    !completed && (
                    <span>
                      {t.unscheduled}
                    </span>
                  )}
                </div>


                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleSubtasks(
                        todo.id
                      )
                    }
                    className="text-xs font-medium text-sage-700 transition hover:text-sage-500"
                  >
                    {expandedSubtasksId ===
                    todo.id
                      ? t.collapseSteps
                      : t.splitTask}
                  </button>
                  <button type="button" onClick={() => router.push("/calendar?view=day&date=" + encodeURIComponent(todo.task_date ?? ""))}
                    className="ml-4 text-xs font-medium text-sage-700 transition hover:text-sage-500">
                    日历安排 ↗
                  </button>
                </div>
              </div>


              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    startEditing(todo)
                  }
                  disabled={busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
                  title={t.editTask}
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteTodo(todo)
                  }
                  disabled={busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-blush-50 hover:text-blush-500"
                  title={t.deleteTask}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {!completed && (
                  <button
                    type="button"
                    onClick={() =>
                      openFocus(todo.id)
                    }
                    disabled={busy}
                    className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-sage-500 text-white transition hover:bg-sage-700"
                    title={t.startFocus}
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                )}
              </div>
            </div>


            {expandedSubtasksId ===
              todo.id && (
              <div className="border-t border-line px-4 py-4">
                <TodoSubtasks
                  todoId={todo.id}

                  onOpenNotes={
                    (subtaskId) =>
                      onOpenNotes?.({
                        todoId:
                          todo.id,
                        todoTitle:
                          todo.title,
                        targetSubtaskId:
                          subtaskId ??
                          null,
                      })
                  }

                  /*
                   * 关键桥接：
                   * TodoSubtasks -> TodoList -> Workspace
                   */
                  onSubtasksChange={
                    (subtasks) =>
                      onSubtasksChange?.(
                        todo.id,
                        subtasks
                      )
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
