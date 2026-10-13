"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import DurationInput, {
  durationValueToMinutes,
  type DurationUnit,
} from "@/components/DurationInput";

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
  onCreated?: () => void;
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

  const [minutes, setMinutes] =
    useState("");

  const [
    durationUnit,
    setDurationUnit,
  ] =
    useState<DurationUnit>(
      "minute"
    );

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
  const [planMode,setPlanMode]=useState<"flexible"|"fixed">("flexible");
  const [cadence,setCadence]=useState<"daily"|"weekly_days"|"weekly_quota">("daily");
  const [weekdays,setWeekdays]=useState<number[]>([]);
  const [habitArrangement,setHabitArrangement]=useState<"flexible"|"fixed">("flexible");
  const [monthDays,setMonthDays]=useState<number[]>([]);
  const [includeMonthEnd,setIncludeMonthEnd]=useState(false);
  const [timesPerWeek,setTimesPerWeek]=useState(3);
  const [sessionStart,setSessionStart]=useState("");
  const [sessionEnd,setSessionEnd]=useState("");

  const [journeyColor, setJourneyColor] = useState("blue");
  const [goalPeriod, setGoalPeriod] = useState<"day" | "week" | "month">("week");
  const [goalValue, setGoalValue] = useState("4");
  const [startDate, setStartDate] = useState(taskDate);
  const [targetFinish, setTargetFinish] = useState("");
  const [officialDeadline, setOfficialDeadline] = useState("");


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

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        t.noTitle
      );
      return;
    }

    const parsedMinutes =
      durationValueToMinutes(
        minutes,
        durationUnit
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

    if(taskType==="one_time" && planMode==="fixed"){
      const from=new Date(sessionStart).getTime(),to=new Date(sessionEnd).getTime();
      if(!sessionStart||!sessionEnd||!Number.isFinite(from)||!Number.isFinite(to)||to<=from){
        setError(dictionary.common?.minutes==="分钟"?"请选择有效的开始与结束时间。":"Choose a valid start and end time.");return;
      }
    }
    if (taskType==="habit") {
      if (cadence==="weekly_days" && weekdays.length===0) {
        setError("请选择至少一天 / Select at least one weekday"); return;
      }
      if (goalPeriod==="week" && cadence==="weekly_quota" && (!Number.isInteger(Number(goalValue)) || Number(goalValue)<1 || Number(goalValue)>7)) {setError("目前每周灵活次数为 1–7 次。");return;}
      if (goalPeriod==="month" && habitArrangement==="fixed" && monthDays.length===0 && !includeMonthEnd){setError("请至少选择一个月度日期，或选择每月最后一天。");return;}
    }
    if (taskType==="planned" && (!targetFinish || targetFinish<startDate || (officialDeadline && officialDeadline<targetFinish))) {
      setError("请确认目标完成日期不早于开始日期，正式截止日期不早于目标完成日期。");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase =
      createClient();

    let created: { id: string } | null = null;
    let createError: { message: string } | null = null;
    if (taskType === "habit") {
      const fixedWeek = goalPeriod==="week" && cadence==="weekly_days";
      const fixedMonth = goalPeriod==="month" && habitArrangement==="fixed";
      const target = fixedWeek ? weekdays.length : fixedMonth ? monthDays.length+(includeMonthEnd?1:0) : Number(goalValue);
      const {data,error:rpcError}=await supabase.rpc("save_habit_v3",{
        payload:{
          title:cleanTitle,description:description.trim()||null,estimated_minutes:parsedMinutes,
          task_date:taskDate,category,custom_tag:category==="other"?customTag.trim()||null:null,
          group_id:visibility==="space"?activeSpaceId:null,
          period:goalPeriod,arrangement:fixedWeek||fixedMonth?"fixed":"flexible",
          target_count:target,weekdays:fixedWeek?weekdays:[],month_days:fixedMonth?monthDays:[],
          include_month_end:fixedMonth&&includeMonthEnd,
        },
      });
      createError=rpcError;
      if(!rpcError&&data)created={id:data as string};
    } else {
      const { data, error } = await supabase.from("todos").insert({
        user_id: userId,
        group_id: visibility === "space" ? activeSpaceId : null,
        title: cleanTitle,
        description: description.trim() || null,
        estimated_minutes: parsedMinutes,
        task_date: taskDate,
        category,
        custom_tag: customTag.trim() || null,
        task_type: "one_time",
        ...(taskType==="planned" ? { plan_start_date:startDate, target_finish_date:targetFinish, deadline_date:officialDeadline||null } : {}),
      }).select("id").single();
      created = data;
      createError = error;
    }
    const error = createError;

    if (!error && created && taskType === "one_time" && planMode === "fixed") {
      const { error: sessionError } = await supabase.from("todo_sessions").insert({
        todo_id: created.id,
        scheduled_start: new Date(sessionStart).toISOString(),
        scheduled_end: new Date(sessionEnd).toISOString(),
      });
      if (sessionError) {
        setError("任务已创建，但时间安排未保存 / Task created but schedule failed: " + sessionError.message);
        setBusy(false);
        router.refresh();
        return;
      }
    }

    // Habit recurrence is persisted atomically by save_habit_v3.
    // Do not write habit_patterns_v3 or duplicate the frequency in
    // task_goal_settings from this form. Optional performance-goal
    // persistence will be reinstated via a separate atomic RPC revision.

    if (!error && created && taskType==="planned") {
      const { error: journeyError } = await supabase.from("goal_journeys").insert({todo_id:created.id,start_date:startDate,target_date:targetFinish,animal_type:"cat",journey_type:"swim",color_key:journeyColor});
      if (journeyError) { setError("任务已创建，但成长旅程未创建：" + journeyError.message); setBusy(false); router.refresh(); return; }
    }
    setBusy(false);

    if (error) {
      setError(
        t.addFailed +
          error.message
      );
      return;
    }

    /*
     * 成功后清空任务内容
     */
    setTitle("");
    setDescription("");
    setMinutes("");
    setCustomTag("");

    setJourneyColor("blue");
    setGoalPeriod("week");
    setGoalValue("4");
    setTaskType("one_time");
    setPlanMode("flexible");
    setCadence("daily");setWeekdays([]);setTimesPerWeek(3);setHabitArrangement("flexible");setMonthDays([]);setIncludeMonthEnd(false);
    setSessionStart("");setSessionEnd("");
    setStartDate(taskDate);
    setTargetFinish("");
    setOfficialDeadline("");


    /*
     * category 和 visibility
     * 故意保留。
     *
     * 连续创建任务时，
     * 不需要每次重新选择。
     */
    onCreated?.();
    router.refresh();
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
        {category==="other"&&<input className={field} value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder={zh?"自定义分类":"Custom tag"} disabled={busy}/>}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft">{zh?"任务类型":"Task type"}</p>
        <div className="grid grid-cols-3 gap-2">
          {([{value:"one_time",label:zh?"单次任务":"One-time",help:zh?"做完即结束":"Finish once"},{value:"planned",label:zh?"定期任务":"Planned",help:zh?"按期限完成":"Target finish"},{value:"habit",label:zh?"习惯养成":"Habit",help:zh?"长期记录":"Build a habit"}] as const).map(item=>
            <button key={item.value} type="button" disabled={busy} aria-pressed={taskType===item.value} onClick={()=>{setTaskType(item.value);if(item.value==="habit"){setCadence("weekly_quota");setGoalPeriod("week");setGoalValue("3");setTimesPerWeek(3);}else if(item.value==="planned"){}else{}}}
              className={`min-w-0 rounded-xl border px-2 py-3 text-center transition ${taskType===item.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line bg-white text-ink-soft hover:bg-paper"}`}>
              <span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[10px] opacity-70">{item.help}</span>
            </button>)}
        </div>
      </div>
      {taskType==="planned" ? (
        <section className="space-y-3 rounded-xl border border-line bg-paper/30 p-3">
          <p className="text-xs text-ink-faint">{zh?"围绕一个成果制定计划，不是重复打卡。具体步骤与时间可创建后再安排。":"Plan toward one outcome, not recurring check-ins."}</p>
          <label className="block text-xs text-ink-soft">{zh?"计划开始":"Plan start"}<input type="date" className={field+" mt-1"} value={startDate} onChange={e=>setStartDate(e.target.value)} disabled={busy}/></label>
          <label className="block text-xs text-ink-soft">{zh?"目标完成":"Target finish"}<input type="date" className={field+" mt-1"} min={startDate} value={targetFinish} onChange={e=>setTargetFinish(e.target.value)} disabled={busy} required/></label>
          <details><summary className="cursor-pointer text-xs text-ink-soft">{zh?"正式截止日期（可选）":"Official deadline (optional)"}</summary>
            <input type="date" className={field+" mt-2"} min={targetFinish||startDate} value={officialDeadline} onChange={e=>setOfficialDeadline(e.target.value)} disabled={busy}/>
          </details>
          <div className="space-y-1.5">
            <p className="text-xs text-ink-soft">{zh?"旅程颜色（自动随计划建立）":"Journey color (created automatically)"}</p>
            <div className="flex flex-wrap gap-2">{([{id:"blue",hex:"#4B83D1"},{id:"green",hex:"#38A179"},{id:"purple",hex:"#9268C5"},{id:"orange",hex:"#DE9144"},{id:"pink",hex:"#D9769B"},{id:"teal",hex:"#329B9C"}] as const).map(c=><button type="button" key={c.id} aria-label={c.id} aria-pressed={journeyColor===c.id} onClick={()=>setJourneyColor(c.id)} disabled={busy} className={`h-8 w-8 rounded-full border-4 ${journeyColor===c.id?"border-ink":"border-white"}`} style={{backgroundColor:c.hex}}/>)}</div>
          </div>
        </section>
      ):taskType==="one_time" ? (
        <section className="space-y-3">
          <p className="text-xs font-medium text-ink-soft">{zh?"什么时候处理？（可选）":"When? (optional)"}</p>
          <div className="grid grid-cols-2 gap-2">
            {([{value:"flexible",label:zh?"灵活安排":"Flexible"},{value:"fixed",label:zh?"固定时段":"Booked time"}] as const).map(item=>
              <button type="button" key={item.value} onClick={()=>setPlanMode(item.value)} aria-pressed={planMode===item.value} disabled={busy} className={`rounded-xl border px-3 py-2 text-sm ${planMode===item.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{item.label}</button>)}
          </div>
          {planMode==="fixed"&&<div className="space-y-3 rounded-xl bg-paper/40 p-3">
            <label className="block text-xs text-ink-soft">{zh?"开始":"Start"}<input className={field+" mt-1"} type="datetime-local" value={sessionStart} disabled={busy} onChange={e=>{setSessionStart(e.target.value);if(minutes&&Number(minutes)>0){const d=new Date(e.target.value);if(!Number.isNaN(d.getTime())){d.setMinutes(d.getMinutes()+Number(minutes)*(durationUnit==="hour"?60:1));const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);setSessionEnd(local);}}}}/></label>
            <label className="block text-xs text-ink-soft">{zh?"结束":"End"}<input className={field+" mt-1"} type="datetime-local" value={sessionEnd} disabled={busy} min={sessionStart||undefined} onChange={e=>setSessionEnd(e.target.value)}/></label>
            <p className="text-xs text-ink-faint">{zh?"输入开始时间和预计时长可自动推算结束；也可以自行调整。":"Start and estimate can suggest an end; you can adjust it."}</p>
          </div>}
        </section>
      ):(
        <section className="space-y-3 rounded-xl bg-paper/40 p-3">
          <p className="text-xs font-medium text-ink-soft">{zh?"重复频率":"Repeat frequency"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"统计周期":"Period"}<select className={field+" mt-1"} value={goalPeriod} onChange={e=>{setGoalPeriod(e.target.value as typeof goalPeriod);setCadence(e.target.value==="day"?"daily":"weekly_quota");setHabitArrangement("flexible");setGoalValue(e.target.value==="day"?"1":"3");setTimesPerWeek(3);}} disabled={busy}><option value="day">{zh?"每天":"Day"}</option><option value="week">{zh?"每周":"Week"}</option><option value="month">{zh?"每月":"Month"}</option></select></label>
            {!(goalPeriod==="week"&&cadence==="weekly_days")&&!(goalPeriod==="month"&&habitArrangement==="fixed")&&<label className="text-xs text-ink-soft">{zh?"执行次数":"Occurrences"}<input className={field+" mt-1"} type="number" min="1" step="1" value={goalValue} disabled={busy} onChange={e=>{setGoalValue(e.target.value);setTimesPerWeek(Math.min(7,Math.max(1,Number(e.target.value)||1)));}}/></label>}
          </div>
          {goalPeriod==="week"&&<div className="space-y-2 rounded-xl border border-line bg-white p-3">
            <p className="text-xs font-medium text-ink-soft">每周执行方式 / Weekly plan</p>
            <div className="grid grid-cols-2 gap-2">{([{id:"weekly_quota",label:"灵活次数"},{id:"weekly_days",label:"固定星期"}] as const).map(option=><button key={option.id} type="button" disabled={busy} aria-pressed={cadence===option.id} onClick={()=>{setCadence(option.id);if(option.id==="weekly_days"){const selected=weekdays.length?weekdays:[1,3,5];setWeekdays(selected);setGoalValue(String(selected.length));}else{setGoalValue(String(timesPerWeek));}}} className={`rounded-lg border px-2 py-2 text-xs ${cadence===option.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
            {cadence==="weekly_days"&&<><div className="grid grid-cols-7 gap-1">{["一","二","三","四","五","六","日"].map((label,index)=><button key={index} type="button" disabled={busy} aria-pressed={weekdays.includes(index+1)} onClick={()=>{const selected=weekdays.includes(index+1)?weekdays.filter(v=>v!==index+1):[...weekdays,index+1].sort((a,b)=>a-b);setWeekdays(selected);setGoalValue(String(selected.length));}} className={`rounded-lg border py-2 text-xs ${weekdays.includes(index+1)?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{label}</button>)}</div><p className="text-xs text-ink-faint">已选 {weekdays.length} 天，自动保存每周 {weekdays.length} 次；不自动占用日历。</p></>}
          </div>}
          {goalPeriod==="month"&&<div className="space-y-3 rounded-xl border border-line bg-white p-3">
            <p className="text-xs font-medium text-ink-soft">每月执行方式</p>
            <div className="grid grid-cols-2 gap-2">{([{value:"flexible",label:"灵活次数"},{value:"fixed",label:"固定日期"}] as const).map(option=><button type="button" key={option.value} disabled={busy} onClick={()=>setHabitArrangement(option.value)} aria-pressed={habitArrangement===option.value} className={`rounded-lg border p-2 text-xs ${habitArrangement===option.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{option.label}</button>)}</div>
            {habitArrangement==="fixed"&&<>
              <div className="grid grid-cols-7 gap-1">{Array.from({length:31},(_,i)=>i+1).map(day=><button key={day} type="button" disabled={busy} onClick={()=>setMonthDays(current=>current.includes(day)?current.filter(x=>x!==day):[...current,day].sort((a,b)=>a-b))} aria-pressed={monthDays.includes(day)} className={`rounded-lg border py-2 text-xs ${monthDays.includes(day)?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{day}</button>)}</div>
              <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={includeMonthEnd} onChange={e=>setIncludeMonthEnd(e.target.checked)} disabled={busy}/> 每月最后一天（28/29/30/31 日自动适配）</label>
              <p className="text-xs text-ink-faint">已选 {monthDays.length} 个日期{includeMonthEnd?"，另加当月最后一天":""}。不存在的日期当月跳过，不自动改期。</p>
            </>}
          </div>}
          {goalPeriod==="week"&&Number(goalValue)>7&&<p className="text-xs text-amber-700">每周超过 7 次尚不支持，请改为 1–7 次。</p>}
          <p className="text-xs text-ink-faint">{zh?"这里只制定执行频率；每次投入时间可在任务的执行安排中单独设置。":"Set the frequency here; choose execution times later."}</p>
        </section>
      )}
      <details className="rounded-xl border border-line px-3 py-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-soft">{zh?"更多选项（可选）":"More options (optional)"}</summary>
        <div className="mt-4 space-y-4">
          {taskType==="one_time"&&<label className="block text-xs text-ink-soft">{zh?"预计投入（可选）":"Estimated effort (optional)"}<DurationInput value={minutes} unit={durationUnit} onValueChange={setMinutes} onUnitChange={setDurationUnit} disabled={busy}/></label>}

          
          <label className="block text-xs text-ink-soft">{zh?"可见范围":"Visibility"}<select className={field+" mt-1"} value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)} disabled={busy}><option value="private">{zh?"仅自己":"Private"}</option><option value="space">{activeSpaceName}</option></select></label>
        </div>
      </details>
      <button className="btn-primary w-full" type="submit" disabled={busy}>{busy?(zh?"保存中…":"Saving..."):(zh?"创建任务":"Create task")}</button>
      {error&&<p role="alert" className="text-sm text-blush-500">{error}</p>}
    </form>
  );
}
