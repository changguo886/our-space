"use client";

import { useState } from "react";
import AppDatePicker from "@/components/ui/AppDatePicker";
import TaskColorPicker from "@/components/ui/TaskColorPicker";
import { DEFAULT_TASK_COLOR, LEGACY_JOURNEY_COLORS, categoryBadgeVisual,taskCardVisual } from "@/lib/task-colors";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";


function formatWorkDate(value: string, chinese: boolean): string {
  const day = value.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return chinese ? "选择日期" : "Choose date";
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(year,month-1,date);
  if (Number.isNaN(parsed.getTime())) return chinese ? "选择日期" : "Choose date";
  return new Intl.DateTimeFormat(chinese?"zh-CN":"en-US", {
    year:"numeric",month:"short",day:"numeric",weekday:"short"
  }).format(parsed);
}

type Category =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";

const CATEGORIES: {
  value: Category;
}[] = [
  { value: "work" },
  { value: "study" },
  { value: "life" },
  { value: "rest" },
  { value: "other" },
];

export default function AddTodoForm({
  userId,
  activeSpaceId,
  activeSpaceName,
  taskDate,
  onCreated,
}: {
  userId: string;
  activeSpaceId: string;
  activeSpaceName: string;
  taskDate: string;
  onCreated?: (createdId:string, planNow:boolean) => void;
}) {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.todo;

  const [title, setTitle] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");





  const [
    category,
    setCategory,
  ] =
    useState<Category | null>(
      null
    );

  const [
    customTag,
    setCustomTag,
  ] = useState("");

  const [
    visibility,
    setVisibility,
  ] =
    useState<
      "private" | "space"
    >("private");

  const [taskType,setTaskType]=useState<"one_time"|"planned"|"habit">("one_time");

  const [cadence,setCadence]=useState<"daily"|"weekly_days"|"weekly_quota">("daily");
  const [weekdays,setWeekdays]=useState<number[]>([]);
  const [habitArrangement,setHabitArrangement]=useState<"flexible"|"fixed">("flexible");
  const [monthDays,setMonthDays]=useState<number[]>([]);
  const [includeMonthEnd,setIncludeMonthEnd]=useState(false);
  const [timesPerWeek,setTimesPerWeek]=useState(3);



  const [taskColor, setTaskColor] = useState(DEFAULT_TASK_COLOR);
  const [goalPeriod, setGoalPeriod] = useState<"day" | "week" | "month">("week");
  const [goalValue, setGoalValue] = useState("4");
  const [startDate, setStartDate] = useState(taskDate);
  const [targetFinish, setTargetFinish] = useState("");
  const [officialDeadline, setOfficialDeadline] = useState("");


  const [partial,setPartial]=useState<null|{id:string;planNow:boolean;extras:{color:string|null;journey:Record<string,unknown>|null};message:string}>(null);
  const [busy, setBusy] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  async function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();
    if (partial) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const planNow = submitter?.dataset.plan === "1";

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        t.noTitle
      );
      return;
    }

    const parsedMinutes = null;

    if (taskType==="habit") {
      if (cadence==="weekly_days" && weekdays.length===0) {
        setError(zh?"请至少选择一个星期。":"Select at least one weekday."); return;
      }
      if (goalPeriod==="week" && cadence==="weekly_quota" && (!Number.isInteger(Number(goalValue)) || Number(goalValue)<1 || Number(goalValue)>7)) {setError(zh?"目前每周灵活次数支持 1–7 次。":"Weekly flexible goals currently support 1–7 occurrences.");return;}
      if (goalPeriod==="month" && habitArrangement==="fixed" && monthDays.length===0 && !includeMonthEnd){setError(zh?"请至少选择一个月度日期或每月最后一天。":"Select at least one monthly date or month-end.");return;}
      const fixedFrequency=(goalPeriod==="week"&&cadence==="weekly_days")||(goalPeriod==="month"&&habitArrangement==="fixed");
      if(!fixedFrequency&&(!Number.isSafeInteger(Number(goalValue))||Number(goalValue)<1||Number(goalValue)>10000)){setError(zh?"请输入有效的执行次数（1–10000）。":"Enter a valid occurrence count (1–10000).");return;}
    }
    if (taskType==="planned" && (!targetFinish || targetFinish<startDate || (officialDeadline && officialDeadline<targetFinish))) {
      setError(zh?"目标完成日期不能早于开始日期；正式截止日期目前不能早于目标日期。":"Target finish cannot precede start; the official deadline currently cannot precede target finish.");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase =
      createClient();

    const fixedWeek = taskType==="habit" && goalPeriod==="week" && cadence==="weekly_days";
    const fixedMonth = taskType==="habit" && goalPeriod==="month" && habitArrangement==="fixed";
    const target = fixedWeek ? weekdays.length : fixedMonth ? monthDays.length+(includeMonthEnd?1:0) : Number(goalValue);
    // V4 semantic types; the compatibility RPC maps these to V3 storage while
    // legacy Calendar / Focus clients are still using the old schema.
    const { data: savedId, error: saveError } = await supabase.rpc("save_task_v4", {
      payload: {
        task_type: taskType==="planned" ? "project" : taskType==="habit" ? "routine" : "one_time",
        title: cleanTitle,
        description: description.trim()||null,
        estimated_minutes: parsedMinutes,
        task_date: taskDate,
        category,
        custom_tag: category==="other" ? customTag.trim()||null : null,
        group_id: visibility==="space" ? activeSpaceId : null,
        ...(taskType==="planned" ? {
          plan_start_date:startDate,target_finish_date:targetFinish,
          deadline_date:officialDeadline||null,
        } : {}),
        ...(taskType==="habit" ? {
          period:goalPeriod,
          arrangement:fixedWeek||fixedMonth?"fixed":"flexible",
          target_count:target,
          weekdays:fixedWeek?weekdays:[],
          month_days:fixedMonth?monthDays:[],
          include_month_end:fixedMonth&&includeMonthEnd,
          starts_on:taskDate,
          strict:false,
        } : {}),
      },
    });
    if (saveError || !savedId) {
      setBusy(false);
      setError(t.addFailed + (saveError?.message ?? ""));
      return;
    }
    const createdId = savedId as string;
    const extras: Extras = {
      color: taskColor,
      journey: taskType==="planned" ? {todo_id:createdId,start_date:startDate,target_date:targetFinish,animal_type:"cat",journey_type:"swim",color_key:Object.entries(LEGACY_JOURNEY_COLORS).find(([,hex])=>hex.toUpperCase()===taskColor.toUpperCase())?.[0]??"green"} : null,
    };
    // The task row now exists: clear the form at once so a second click cannot create a duplicate (A10).
    resetForm();
    const failed = await saveExtras(createdId, extras);
    setBusy(false);
    router.refresh();
    if (failed) { setPartial({id:createdId, planNow, extras:failed.pending, message:failed.message}); return; }
    onCreated?.(createdId, planNow);
  }

  type Extras = { color: string|null; journey: Record<string, unknown>|null };
  async function saveExtras(id: string, extras: Extras): Promise<null|{pending:Extras;message:string}> {
    const supabase = createClient();
    const pending: Extras = { color: null, journey: null };
    const problems: string[] = [];
    if (extras.color) {
      const { error: colorError } = await supabase.from("todos").update({ color_hex: extras.color }).eq("id", id);
      if (colorError) { pending.color = extras.color; problems.push(zh ? "颜色" : "color"); }
    }
    if (extras.journey) {
      const { error: journeyError } = await supabase.from("goal_journeys").insert(extras.journey);
      // 23505: the journey row already exists from an earlier attempt.
      if (journeyError && journeyError.code !== "23505") { pending.journey = extras.journey; problems.push(zh ? "成长旅程" : "journey"); }
    }
    if (!problems.length) return null;
    return { pending, message: zh ? `任务已创建，但${problems.join("和")}没保存成功。` : `Task created, but the ${problems.join(" and ")} could not be saved.` };
  }

  async function retryPartial() {
    if (!partial) return;
    setBusy(true);
    const failed = await saveExtras(partial.id, partial.extras);
    setBusy(false);
    router.refresh();
    if (failed) { setPartial({ ...partial, extras: failed.pending, message: failed.message }); return; }
    const done = partial; setPartial(null); onCreated?.(done.id, done.planNow);
  }

  function dismissPartial() {
    if (!partial) return;
    const done = partial; setPartial(null); onCreated?.(done.id, done.planNow);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setCustomTag("");
    setTaskColor(DEFAULT_TASK_COLOR);
    setGoalPeriod("week");
    setGoalValue("4");
    setTaskType("one_time");
    setCadence("daily");setWeekdays([]);setTimesPerWeek(3);setHabitArrangement("flexible");setMonthDays([]);setIncludeMonthEnd(false);
    setStartDate(taskDate);
    setTargetFinish("");
    setOfficialDeadline("");
    // category and visibility are kept on purpose for consecutive creation.
  }


  const zh = dictionary.common?.minutes === "分钟";
  const field = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-sage-300 focus:ring-2 focus:ring-sage-100";
  const countFromPattern = cadence==="daily" ? 1 : cadence==="weekly_days" ? weekdays.length : timesPerWeek;
  return (
    <form onSubmit={submit} className="space-y-5 pb-4">
      <div>
        <label className="mb-2 block text-xs font-medium text-ink-soft">{zh?"任务名称":"Task name"} *</label>
        <input className={field} value={title} onChange={e=>setTitle(e.target.value)} placeholder={zh?"例如：完成论文":"e.g. Finish paper"} disabled={busy} autoFocus/>
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-ink-soft">{zh?"任务描述（可选）":"Description (optional)"}
          <textarea className={field+" mt-1 min-h-16"} rows={2} value={description} onChange={e=>setDescription(e.target.value)} placeholder={zh?"简要说明任务要求；工作笔记请使用 Quick Notes":"Brief task requirements; use Quick Notes for working notes"} disabled={busy}/>
        </label>
        <label className="block text-xs font-medium text-ink-soft">{zh?"分类":"Category"}
          <select className={field+" mt-1"} value={category??""} onChange={e=>setCategory(e.target.value as Category||null)} disabled={busy}>
            <option value="">{zh?"不分类":"None"}</option>
            {CATEGORIES.map(c=><option key={c.value} value={c.value}>{t.categories[c.value]}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border px-2 py-1" style={categoryBadgeVisual(category)}>{category ? (t.categories as Record<string,string>)[category] : (zh?"未分类":"Uncategorized")}</span><span className="rounded-lg border px-3 py-2 text-ink" style={taskCardVisual(category,taskColor)}>{zh?"任务卡颜色预览":"Task card preview"}</span></div>
        {category==="other"&&<input className={field} value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder={zh?"自定义分类":"Custom tag"} disabled={busy}/>}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft">{zh?"任务类型":"Task type"}</p>
        <div className="grid grid-cols-3 gap-2">
          {([{value:"one_time",label:zh?"单次任务":"One-time",help:zh?"做完即结束":"Finish once"},{value:"planned",label:zh?"定期任务":"Planned",help:zh?"按期限完成":"Target finish"},{value:"habit",label:zh?"习惯养成":"Habit",help:zh?"长期记录":"Build a habit"}] as const).map(item=>
            <button key={item.value} type="button" disabled={busy} aria-pressed={taskType===item.value} onClick={()=>{setTaskType(item.value);if(item.value==="habit"){setCadence("weekly_quota");setGoalPeriod("week");setGoalValue("3");setTimesPerWeek(3);}}}
              className={`min-w-0 rounded-xl border px-2 py-3 text-center transition ${taskType===item.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line bg-white text-ink-soft hover:bg-paper"}`}>
              <span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[10px] opacity-70">{item.help}</span>
            </button>)}
        </div>
      </div>
      {taskType==="planned" ? (
        <section className="space-y-3 rounded-xl border border-line bg-paper/30 p-3">
          <p className="text-xs text-ink-faint">{zh?"围绕一个成果制定计划，不是重复打卡。具体步骤与时间可创建后再安排。":"Plan toward one outcome, not recurring check-ins."}</p>
          <label className="block text-xs text-ink-soft">{zh?"计划开始":"Plan start"}<input type="hidden" value={startDate} readOnly/><AppDatePicker value={startDate} onChange={setStartDate} disabled={busy}/></label>
          <label className="block text-xs text-ink-soft">{zh?"目标完成":"Target finish"}<input type="hidden" value={targetFinish} readOnly/><AppDatePicker value={targetFinish} onChange={setTargetFinish} min={startDate} disabled={busy} required/></label>
          <details><summary className="cursor-pointer text-xs text-ink-soft">{zh?"正式截止日期（可选）":"Official deadline (optional)"}</summary>
            <input type="hidden" value={officialDeadline} readOnly/><AppDatePicker value={officialDeadline} onChange={setOfficialDeadline} disabled={busy}/>
          </details>
          <div className="space-y-1.5">
            <TaskColorPicker value={taskColor} onChange={setTaskColor} disabled={busy}/>

          </div>
        </section>
      ):taskType==="one_time" ? (
        <section className="rounded-xl border border-line bg-paper/30 p-3">
          <p className="text-xs text-ink-soft">{zh?"单次任务只需要先记录内容。具体执行日期、时间窗口和预计投入，请创建后在「执行安排」设置。":"Create the task first. Choose its execution date, window, and effort later."}</p>
        </section>
      ):(
        <section className="space-y-3 rounded-xl bg-paper/40 p-3">
          <p className="text-xs font-medium text-ink-soft">{zh?"重复频率":"Repeat frequency"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"统计周期":"Period"}<select className={field+" mt-1"} value={goalPeriod} onChange={e=>{setGoalPeriod(e.target.value as typeof goalPeriod);setCadence(e.target.value==="day"?"daily":"weekly_quota");setHabitArrangement("flexible");setGoalValue(e.target.value==="day"?"1":"3");setTimesPerWeek(3);}} disabled={busy}><option value="day">{zh?"每天":"Day"}</option><option value="week">{zh?"每周":"Week"}</option><option value="month">{zh?"每月":"Month"}</option></select></label>
            {!(goalPeriod==="week"&&cadence==="weekly_days")&&!(goalPeriod==="month"&&habitArrangement==="fixed")&&<label className="text-xs text-ink-soft">{zh?"执行次数":"Occurrences"}<input className={field+" mt-1"} type="number" min="1" step="1" value={goalValue} disabled={busy} onChange={e=>{setGoalValue(e.target.value);setTimesPerWeek(Math.min(7,Math.max(1,Number(e.target.value)||1)));}}/></label>}
          </div>
          {goalPeriod==="week"&&<div className="space-y-2 rounded-xl border border-line bg-white p-3">
            <p className="text-xs font-medium text-ink-soft">{zh?"每周执行方式":"Weekly pattern"}</p>
            <div className="grid grid-cols-2 gap-2">{([{id:"weekly_quota",label:zh?"灵活次数":"Flexible quota"},{id:"weekly_days",label:zh?"固定星期":"Fixed weekdays"}] as const).map(option=><button key={option.id} type="button" disabled={busy} aria-pressed={cadence===option.id} onClick={()=>{setCadence(option.id);if(option.id==="weekly_days"){const selected=weekdays.length?weekdays:[1,3,5];setWeekdays(selected);setGoalValue(String(selected.length));}else{setGoalValue(String(timesPerWeek));}}} className={`rounded-lg border px-2 py-2 text-xs ${cadence===option.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
            {cadence==="weekly_days"&&<><div className="grid grid-cols-7 gap-1">{(zh?["一","二","三","四","五","六","日"]:["M","T","W","T","F","S","S"]).map((label,index)=><button key={index} type="button" disabled={busy} aria-pressed={weekdays.includes(index+1)} onClick={()=>{const selected=weekdays.includes(index+1)?weekdays.filter(v=>v!==index+1):[...weekdays,index+1].sort((a,b)=>a-b);setWeekdays(selected);setGoalValue(String(selected.length));}} className={`rounded-lg border py-2 text-xs ${weekdays.includes(index+1)?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{label}</button>)}</div><p className="text-xs text-ink-faint">{zh?`已选 ${weekdays.length} 天；不自动占用日历。`:`${weekdays.length} selected days; no calendar time is booked automatically.`}</p></>}
          </div>}
          {goalPeriod==="month"&&<div className="space-y-3 rounded-xl border border-line bg-white p-3">
            <p className="text-xs font-medium text-ink-soft">{zh?"每月执行方式":"Monthly pattern"}</p>
            <div className="grid grid-cols-2 gap-2">{([{value:"flexible",label:zh?"灵活次数":"Flexible quota"},{value:"fixed",label:zh?"固定日期":"Fixed dates"}] as const).map(option=><button type="button" key={option.value} disabled={busy} onClick={()=>setHabitArrangement(option.value)} aria-pressed={habitArrangement===option.value} className={`rounded-lg border p-2 text-xs ${habitArrangement===option.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
            {habitArrangement==="fixed"&&<>
              <div className="grid grid-cols-7 gap-1">{Array.from({length:31},(_,i)=>i+1).map(day=><button key={day} type="button" disabled={busy} onClick={()=>setMonthDays(current=>current.includes(day)?current.filter(x=>x!==day):[...current,day].sort((a,b)=>a-b))} aria-pressed={monthDays.includes(day)} className={`rounded-lg border py-2 text-xs ${monthDays.includes(day)?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{day}</button>)}</div>
              <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={includeMonthEnd} onChange={e=>setIncludeMonthEnd(e.target.checked)} disabled={busy}/> {zh?"每月最后一天（自动适配）":"Last day of month (automatic)"}</label>
              <p className="text-xs text-ink-faint">{zh?`已选 ${monthDays.length} 个日期${includeMonthEnd?"，包含月末":""}。不存在的日期将跳过。`:`${monthDays.length} selected dates${includeMonthEnd?", including month-end":""}. Missing dates are skipped.`}</p>
            </>}
          </div>}
          {goalPeriod==="week"&&Number(goalValue)>7&&<p className="text-xs text-amber-700">{zh?"请使用有效的目标次数。":"Enter a supported target count."}</p>}
          <p className="text-xs text-ink-faint">{zh?"这里只制定执行频率；每次投入时间可在任务的执行安排中单独设置。":"Set the frequency here; choose execution times later."}</p>
        </section>
      )}
      {taskType!=="planned"&&<TaskColorPicker value={taskColor} onChange={setTaskColor} disabled={busy}/>}
      <details className="rounded-xl border border-line px-3 py-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-soft">{zh?"更多选项（可选）":"More options (optional)"}</summary>
        <div className="mt-4 space-y-4">
          

          
          <label className="block text-xs text-ink-soft">{zh?"可见范围":"Visibility"}<select className={field+" mt-1"} value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)} disabled={busy}><option value="private">{zh?"仅自己":"Private"}</option><option value="space">{activeSpaceName}</option></select></label>
        </div>
      </details>
      {partial ? <div role="alert" className="space-y-3 rounded-xl border border-blush-100 bg-blush-50 p-3 text-sm">
        <p className="text-blush-500">{partial.message}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={()=>void retryPartial()} className="flex-1 rounded-lg border border-blush-100 bg-white px-3 py-2">{busy?(zh?"重试中…":"Retrying…"):(zh?"重试":"Retry")}</button>
          <button type="button" disabled={busy} onClick={dismissPartial} className="flex-1 rounded-lg px-3 py-2 text-ink-soft">{zh?"先这样":"Skip for now"}</button>
        </div>
      </div> : <div className="flex gap-2">
        <button className="flex-1 rounded-xl border border-line bg-white px-4 py-3 text-[15px] font-medium text-ink disabled:opacity-50" type="submit" data-plan="0" disabled={busy}>{busy?(zh?"保存中…":"Saving..."):(zh?"创建":"Create")}</button>
        <button className="btn-primary flex-[1.4]" type="submit" data-plan="1" disabled={busy}>{zh?"创建并安排时间":"Create & plan time"}</button>
      </div>}
      {error&&<p role="alert" className="text-sm text-blush-500">{error}</p>}
    </form>
  );
}
