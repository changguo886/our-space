"use client";

import { useRef, useState } from "react";

import {
  Check,
  Circle,
  Play,
  X,
  Save,
  Repeat } from "lucide-react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RoutineCheckIn from "@/components/RoutineCheckIn";
import { useI18n } from "@/components/I18nProvider";
import SpaceSharingPicker, { loadTaskSharing, sameSharing, saveTaskSharing, type TaskSharing } from "@/components/SpaceSharingPicker";
import {taskCardCompactVisual,CATEGORY_VISUALS,CATEGORY_ORDER} from "@/lib/task-colors";
import RowMenu from "@/components/ui/RowMenu";
import { useNextPlans } from "@/components/useNextPlans";
import { planStatus } from "@/lib/schedule-utils";
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
  color_hex?: string | null;
  custom_tag?: string | null;
  task_type?: "one_time" | "project" | "routine" | "recurring" | "habit" | null;
  plan_start_date?: string | null;
  target_finish_date?: string | null;
  deadline_date?: string | null;
  // Embedded by Today / Todo pages: the Spaces this task is shared to.
  todo_space_shares?: { group_id: string }[] | null;
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

function localDay(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }
function localClock(d: Date) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

export function isRoutineTask(todo: { task_type?: string | null }) {
  return todo.task_type === "routine" || todo.task_type === "habit";
}

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

  const todayISO = localDay(new Date());
  // Same-category tasks sit together (work, study, life, rest, other, uncategorized); order inside a group is kept.
  const categoryGroups = CATEGORY_ORDER.map((key) => {
    const visual = CATEGORY_VISUALS[key];
    return {
      key,
      label: language === "zh-CN" ? visual.labelZh : visual.labelEn,
      accent: visual.accent,
      todos: todos.filter((x) => ((x.category && x.category in CATEGORY_VISUALS) ? x.category : "none") === key),
    };
  }).filter((g) => g.todos.length > 0);
  const nextPlans = useNextPlans(todos.map((x) => x.id));

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

  // null while loading (or if it failed): the picker is hidden and sharing is left untouched on save.
  const [editSharing, setEditSharing] = useState<TaskSharing | null>(null);
  const [originalSharing, setOriginalSharing] = useState<TaskSharing | null>(null);
  const sharingFor = useRef<string | null>(null);

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

  const [editType,setEditType]=useState<"one_time"|"planned"|"habit">("one_time");
  const [editPlanStart,setEditPlanStart]=useState("");
  const [editTargetFinish,setEditTargetFinish]=useState("");
  const [editDeadline,setEditDeadline]=useState("");
  const [habitPeriod,setHabitPeriod]=useState<"day"|"week"|"month">("week");
  const [habitMode,setHabitMode]=useState<"flexible"|"fixed">("flexible");
  const [habitMonthDays,setHabitMonthDays]=useState<number[]>([]);
  const [habitMonthEnd,setHabitMonthEnd]=useState(false);
  const [habitLoaded,setHabitLoaded]=useState(false);
  const [editRuleWeekdays,setEditRuleWeekdays]=useState<number[]>([]);
  const [editRuleQuota,setEditRuleQuota]=useState(3);

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
    // A routine is never completed as a whole; each occurrence is a completion event.
    if (isRoutineTask(todo)) return;
    if (busyId) return;

    setBusyId(todo.id);
    setError(null);

    const supabase =
      createClient();

    const completed =
      todo.status ===
      "completed";

    const { error } =
      await supabase
        .from("todos")
        .update({
          status: completed
            ? "pending"
            : "completed",

          started_at: null,

          completed_at:
            completed
              ? null
              : new Date().toISOString(),
        })
        .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        t.updateFailed +
          error.message
      );

      return;
    }

    router.refresh();
  }


  function openFocus(
    todoId: string
  ) {
    router.push(
      `/focus/${todoId}`
    );
  }


  /* =======================================================
     Todo edit
  ======================================================= */

  async function startEditing(
    todo: Todo
  ) {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditType((todo.task_type==="routine"||todo.task_type==="habit")?"habit":todo.target_finish_date?"planned":"one_time");
    setEditPlanStart(todo.plan_start_date??todo.task_date??"");
    setEditTargetFinish(todo.target_finish_date??"");
    setEditDeadline(todo.deadline_date??"");

    setEditDescription(
      todo.description ?? ""
    );

    setEditDurationUnit(
      "minute"
    );

    setEditMinutes(
      todo.estimated_minutes
        ? String(
            todo.estimated_minutes
          )
        : ""
    );

    setEditCategory(
      todo.category ?? null
    );

    setEditCustomTag(
      todo.custom_tag ?? ""
    );

    setError(null);
    setEditSharing(null);
    setOriginalSharing(null);
    sharingFor.current = todo.id;
    void loadTaskSharing(createClient(), todo.id).then((loaded) => {
      if (sharingFor.current !== todo.id) return; // another task was opened meanwhile
      setEditSharing(loaded);
      setOriginalSharing(loaded);
    });
    setHabitLoaded(false);
    setHabitPeriod("week");setHabitMode("flexible");setEditRuleWeekdays([]);
    setEditRuleQuota(3);setHabitMonthDays([]);setHabitMonthEnd(false);
    if((todo.task_type==="routine"||todo.task_type==="habit")){
      const {data:pattern,error:patternError}=await createClient().from("habit_patterns_v3")
        .select("period,arrangement,target_count,weekdays,month_days,include_month_end")
        .eq("todo_id",todo.id).maybeSingle();
      if(patternError||!pattern){setError("读取习惯规则失败："+(patternError?.message??"缺少习惯规则"));return;}
      setHabitPeriod(pattern.period);setHabitMode(pattern.arrangement);
      setEditRuleQuota(pattern.target_count);setEditRuleWeekdays(pattern.weekdays??[]);
      setHabitMonthDays(pattern.month_days??[]);setHabitMonthEnd(Boolean(pattern.include_month_end));
      setHabitLoaded(true);
    }
  }


  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditMinutes("");
    setEditDurationUnit(
      "minute"
    );
    setEditCategory(null);
    setEditCustomTag("");
    sharingFor.current = null;
    setEditSharing(null);
    setOriginalSharing(null);
    setError(null);
  }


  async function saveEdit(
    todoId: string
  ) {
    const cleanTitle =
      editTitle.trim();

    if (!cleanTitle) {
      setError(
        t.noTitle
      );
      return;
    }

    const parsedMinutes =
      durationValueToMinutes(
        editMinutes,
        editDurationUnit
      );

    if (
      parsedMinutes !== null &&
      Number.isNaN(
        parsedMinutes
      )
    ) {
      setError(
        t.invalidDuration
      );
      return;
    }

    const original=todos.find(item=>item.id===todoId);
    const originalType=(original?.task_type==="routine"||original?.task_type==="habit")?"habit":original?.target_finish_date?"planned":"one_time";
    if(editType==="habit"&&originalType!=="habit"){setError("转换为习惯需要同时建立目标和规则，当前请先使用完整创建入口；原任务与历史记录不会被删除。");return;}
    if(originalType==="habit"&&editType!=="habit"){setError("已有习惯日志与规则，暂不能直接转换为其他类型，以免历史记录含义发生变化。");return;}
    if(editType==="planned"&&(!editPlanStart||!editTargetFinish||editTargetFinish<editPlanStart||(editDeadline&&editDeadline<editTargetFinish))){setError("请填写有效的计划开始日期与目标完成日期。");return;}
    if(originalType==="planned"&&editType==="one_time"&&!window.confirm("改为单次任务将清除计划日期，但不会删除笔记、步骤、Focus 或 Journey 历史。确认继续？"))return;
    setBusyId(todoId);
    setError(null);

    const supabase =
      createClient();

    if(originalType==="habit"&&!habitLoaded){setBusyId(null);setError("习惯规则未加载完成，无法保存。");return;}
    const weekFixed=habitPeriod==="week"&&habitMode==="fixed";
    const monthFixed=habitPeriod==="month"&&habitMode==="fixed";
    const total=weekFixed?editRuleWeekdays.length:monthFixed?habitMonthDays.length+(habitMonthEnd?1:0):editRuleQuota;
    if(originalType==="habit"&&(!Number.isInteger(total)||total<1||(habitPeriod==="week"&&total>7))){
      setBusyId(null);setError("请确认周期次数和固定日期有效。");return;
    }
    const {error:saveError}=await supabase.rpc("save_task_v4",{
      edit_id:todoId,
      payload:{
        task_type:editType==="planned"?"project":editType==="habit"?"routine":"one_time",
        title:cleanTitle,description:editDescription.trim()||null,
        estimated_minutes:parsedMinutes,
        task_date:original?.task_date,
        category:editCategory,
        custom_tag:editCategory==="other"?editCustomTag.trim()||null:null,
        // Sharing lives in todo_space_shares; retire the legacy column on edit.
        group_id:null,
        ...(editType==="planned"?{
          plan_start_date:editPlanStart,target_finish_date:editTargetFinish,
          deadline_date:editDeadline||null,
        }:{}),
        ...(editType==="habit"?{
          period:habitPeriod,arrangement:habitPeriod==="day"?"flexible":habitMode,
          target_count:total,weekdays:weekFixed?editRuleWeekdays:[],
          month_days:monthFixed?habitMonthDays:[],
          include_month_end:monthFixed&&habitMonthEnd,
        }:{}),
      },
    });
    if(saveError){setBusyId(null);setError(t.saveFailed+saveError.message);return;}
    if(editSharing&&originalSharing&&!sameSharing(editSharing,originalSharing)){
      const sharingError=await saveTaskSharing(supabase,todoId,editSharing);
      if(sharingError){setBusyId(null);setError("任务已保存，但分享范围没保存成功："+sharingError);router.refresh();return;}
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


      {categoryGroups.map((group) => <section key={group.key} aria-label={group.label} className="space-y-2">
        {categoryGroups.length > 1 && <h4 className="flex items-center gap-2 px-1 pt-2 text-xs font-medium text-ink-soft first:pt-0">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: group.accent }} />
          {group.label}<span className="text-ink-faint">{group.todos.length}</span>
        </h4>}
      {group.todos.map((todo) => {
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
                  <div className="grid grid-cols-3 gap-2">{([{id:"one_time",label:"单次任务"},{id:"planned",label:"长期项目"},{id:"habit",label:"周期任务"}] as const).map(option=><button type="button" key={option.id} onClick={()=>setEditType(option.id)} aria-pressed={editType===option.id} className={`rounded-lg border px-2 py-2 text-xs ${editType===option.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
                  {editType==="planned"&&<div className="space-y-2"><label className="block text-xs text-ink-soft">计划开始<input type="date" className="input mt-1 w-full" value={editPlanStart} onChange={e=>setEditPlanStart(e.target.value)}/></label><label className="block text-xs text-ink-soft">目标完成<input type="date" className="input mt-1 w-full" value={editTargetFinish} min={editPlanStart} onChange={e=>setEditTargetFinish(e.target.value)}/></label><label className="block text-xs text-ink-soft">正式截止（可选）<input type="date" className="input mt-1 w-full" value={editDeadline} min={editTargetFinish} onChange={e=>setEditDeadline(e.target.value)}/></label></div>}
                  {editType==="habit"&&todo.task_type!=="habit"&&<p className="text-xs text-amber-700">切换为习惯需要建立习惯规则和目标，此次暂不允许保存该转换。</p>}
                  {(todo.task_type==="routine"||todo.task_type==="habit")&&editType!=="habit"&&<p className="text-xs text-amber-700">已有习惯记录不会被删除。此转换暂不可保存。</p>}
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

                {editSharing&&<div className="rounded-xl border border-line p-3">
                  <SpaceSharingPicker value={editSharing} onChange={setEditSharing} hasDescription={editDescription.trim().length>0} zh={common?.minutes==="分钟"} disabled={busy}/>
                </div>}

                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">预计投入（可选）</summary>
                  <div className="mt-3">
                    <DurationInput value={editMinutes} unit={editDurationUnit} onValueChange={setEditMinutes} onUnitChange={setEditDurationUnit} disabled={busy}/>
                    <p className="mt-2 text-xs text-ink-faint">固定日历时段和灵活执行安排，请在任务工作区的「执行安排」中添加与管理。</p>
                  </div>
                </details>

                {(todo.task_type==="routine"||todo.task_type==="habit")&&<details open className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">习惯频率与日期（可修改）</summary>
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs text-ink-soft">统计周期<select className="input mt-1 w-full" value={habitPeriod} disabled={busy||!habitLoaded} onChange={e=>{const v=e.target.value as typeof habitPeriod;setHabitPeriod(v);if(v==="day")setHabitMode("flexible");}}><option value="day">每天</option><option value="week">每周</option><option value="month">每月</option></select></label>
                    {habitPeriod!=="day"&&<div className="grid grid-cols-2 gap-2">{(["flexible","fixed"] as const).map(x=><button type="button" key={x} disabled={busy||!habitLoaded} aria-pressed={habitMode===x} onClick={()=>setHabitMode(x)} className={`rounded-lg border p-2 text-xs ${habitMode===x?"border-sage-400 bg-sage-50":"border-line"}`}>{x==="fixed"?"固定日期":"灵活次数"}</button>)}</div>}
                    {(habitPeriod==="day"||habitMode==="flexible")&&<label className="block text-xs text-ink-soft">每{habitPeriod==="day"?"天":habitPeriod==="week"?"周":"月"}目标次数<input type="number" min="1" max={habitPeriod==="week"?7:10000} value={editRuleQuota} disabled={busy||!habitLoaded} onChange={e=>setEditRuleQuota(Number(e.target.value))} className="input mt-1 w-full"/></label>}
                    {habitPeriod==="week"&&habitMode==="fixed"&&<div className="grid grid-cols-7 gap-1">{["一","二","三","四","五","六","日"].map((x,i)=><button key={x} type="button" disabled={busy||!habitLoaded} aria-pressed={editRuleWeekdays.includes(i+1)} onClick={()=>setEditRuleWeekdays(v=>v.includes(i+1)?v.filter(n=>n!==i+1):[...v,i+1].sort((a,b)=>a-b))} className={`rounded-lg border py-2 text-xs ${editRuleWeekdays.includes(i+1)?"border-sage-400 bg-sage-50":"border-line"}`}>{x}</button>)}</div>}
                    {habitPeriod==="month"&&habitMode==="fixed"&&<><div className="grid grid-cols-7 gap-1">{Array.from({length:31},(_,i)=>i+1).map(d=><button key={d} type="button" disabled={busy||!habitLoaded} aria-pressed={habitMonthDays.includes(d)} onClick={()=>setHabitMonthDays(v=>v.includes(d)?v.filter(n=>n!==d):[...v,d].sort((a,b)=>a-b))} className={`rounded-lg border py-2 text-xs ${habitMonthDays.includes(d)?"border-sage-400 bg-sage-50":"border-line"}`}>{d}</button>)}</div><label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={habitMonthEnd} disabled={busy||!habitLoaded} onChange={e=>setHabitMonthEnd(e.target.checked)}/> 每月最后一天</label></>}
                    <p className="text-xs text-ink-faint">保存后更新习惯频率，历史打卡与专注记录保留。固定执行时段仍在「执行安排」管理。</p>
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
           Normal Todo card (compact)
        ================================================= */
        const routine = isRoutineTask(todo);
        const zhCard = language === "zh-CN";
        const legacyNext = !nextPlans[todo.id] && todo.scheduled_start && todo.scheduled_end && new Date(todo.scheduled_end).getTime() > Date.now()
          ? { day: localDay(new Date(todo.scheduled_start)), mode: "fixed" as const, start: localClock(new Date(todo.scheduled_start)), end: localClock(new Date(todo.scheduled_end)) }
          : null;
        const plan = planStatus({ type: todo.task_type, taskDate: todo.task_date, today: todayISO, next: nextPlans[todo.id] ?? legacyNext, zh: zhCard });
        const typeText = routine ? (zhCard ? "周期任务" : "Routine") : todo.task_type === "project" ? (zhCard ? "长期项目" : "Project") : (zhCard ? "单次任务" : "One-time");

        return (
          <div
            key={todo.id}
            className="group rounded-xl border transition hover:shadow-sm"
            style={taskCardCompactVisual(todo.category,todo.color_hex)}
          >
            <div className="flex items-center gap-2.5 px-3 py-2">
              <button
                type="button"
                onClick={() => toggleTodo(todo)}
                disabled={busy || routine}
                aria-hidden={routine || undefined}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                title={routine ? undefined : completed ? t.markIncomplete : t.markComplete}
              >
                {routine ? <Repeat aria-label={zhCard ? "周期任务" : "Routine"} className="h-[18px] w-[18px] text-sage-600" /> : completed ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sage-500 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <Circle className="h-5 w-5 text-ink-faint" />
                )}
              </button>

              <div className="min-w-0 flex-1" title={todo.description ?? undefined}>
                <div className="flex min-w-0 items-center gap-2">
                  <p className={`min-w-0 truncate text-sm ${completed ? "text-ink-faint line-through" : "font-medium text-ink"}`}>{todo.title}</p>
                  {category && <span aria-label={category.label} title={category.label} className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_VISUALS[todo.category ?? "none"]?.accent }} />}
                  {(todo.status === "running" || todo.status === "paused") && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${status.className}`}>{status.label}</span>}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
                  <span className="text-ink-faint">{typeText}</span>
                  {(todo.todo_space_shares?.length ?? 0) > 0 && <span className="text-ink-faint" title={zhCard ? "空间成员可以看到这个任务" : "Visible to Space members"}>· {zhCard ? `已分享到 ${todo.todo_space_shares!.length} 个空间` : `Shared to ${todo.todo_space_shares!.length} space${todo.todo_space_shares!.length > 1 ? "s" : ""}`}</span>}
                  {!completed && <>
                    <span aria-hidden="true" className="text-ink-faint">·</span>
                    <span className={plan.tone === "todo" ? "font-medium text-amber-700" : plan.tone === "muted" ? "text-ink-faint" : "text-ink-soft"}>{plan.text}</span>
                  </>}
                  {!routine && todo.estimated_minutes ? <span className="text-ink-faint">· {zhCard ? `约 ${todo.estimated_minutes} 分钟` : `~${todo.estimated_minutes} min`}</span> : null}
                </div>
              </div>

              <RowMenu zh={zhCard} items={[
                { label: expandedSubtasksId === todo.id ? t.collapseSteps : t.splitTask, onClick: () => toggleSubtasks(todo.id) },
                { label: zhCard ? "日历安排" : "Open in calendar", onClick: () => router.push("/calendar?view=day&date=" + encodeURIComponent(todo.task_date ?? todayISO)) },
                { label: t.editTask, onClick: () => startEditing(todo) },
                { label: t.deleteTask, onClick: () => deleteTodo(todo), danger: true },
              ]} />

              {!completed && (
                <button
                  type="button"
                  onClick={() => openFocus(todo.id)}
                  disabled={busy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-500 text-white transition hover:bg-sage-700"
                  title={t.startFocus}
                  aria-label={t.startFocus}
                >
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </button>
              )}
            </div>

            {routine && <div className="pb-2 pl-[52px] pr-3"><RoutineCheckIn todoId={todo.id} compact /></div>}

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
      </section>)}
    </div>
  );
}
