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
  const [timesPerWeek,setTimesPerWeek]=useState(3);
  const [repeatEnd,setRepeatEnd]=useState("");
  const [sessionStart,setSessionStart]=useState("");
  const [sessionEnd,setSessionEnd]=useState("");
  const [crossDay,setCrossDay]=useState(false);

  const [journeyColor, setJourneyColor] = useState("blue");
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [goalMetric, setGoalMetric] = useState<"count" | "duration">("count");
  const [goalPeriod, setGoalPeriod] = useState<"day" | "week" | "month">("week");
  const [goalValue, setGoalValue] = useState("4");
  const [extraCount, setExtraCount] = useState("");
  const [extraPeriodMinutes, setExtraPeriodMinutes] = useState("");
  const [perSessionMinutes, setPerSessionMinutes] = useState("");
  const [totalMinutes, setTotalMinutes] = useState("");
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
      if (goalPeriod==="day" && Number(goalValue)!==1) {setError("当前每日习惯只支持 1 次；每日多次将在后续规则扩展中支持。");return;}
      if (goalPeriod==="week" && (!Number.isInteger(Number(goalValue)) || Number(goalValue)<1 || Number(goalValue)>7)) {setError("当前每周习惯支持 1–7 次。");return;}
      if (repeatEnd && repeatEnd < taskDate) {
        setError("重复结束日期不能早于开始日期 / Invalid repeat end date"); return;
      }
    }
    if (taskType === "habit") {
      const required = Number(goalValue);
      const optional = [extraCount, extraPeriodMinutes, perSessionMinutes, totalMinutes];
      if (!Number.isSafeInteger(required) || required <= 0 ||
          optional.some(value => value.trim() !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0))) {
        setError("目标必须是正整数（时间以分钟计） / Goals must be positive integers (minutes for duration).");
        return;
      }
      // Weekly quota already defines its frequency. The goal uses the same value.
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
      const { data, error: rpcError } = await supabase.rpc("create_scheduled_todo_v2", {
        p_task_type: taskType,
        p_title: cleanTitle,
        p_description: description.trim() || null,
        p_estimated_minutes: parsedMinutes,
        p_task_date: taskDate,
        p_category: category,
        p_custom_tag: customTag.trim() || null,
        p_group_id: visibility === "space" ? activeSpaceId : null,
        p_cadence: cadence,
        p_weekdays: cadence === "weekly_days" ? weekdays : [],
        p_times_per_week: cadence === "weekly_quota" ? timesPerWeek : null,
        p_ends_on: repeatEnd || null,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      createError = rpcError;
      if (!rpcError && data) created = { id: data as string };
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

    if (!error && created && taskType === "habit") {
      const { error: goalError } = await supabase.from("task_goal_settings").insert({
        todo_id: created.id,
        primary_metric: goalMetric,
        period: goalPeriod,
        target_value: cadence === "weekly_quota" && goalPeriod === "week" && goalMetric === "count" ? timesPerWeek : Number(goalValue),
        frequency_target: goalMetric === "duration" ? (cadence === "weekly_quota" && goalPeriod === "week" ? timesPerWeek : extraCount.trim() ? Number(extraCount) : null) : null,
        period_duration_target_minutes: goalMetric === "count" && extraPeriodMinutes.trim() ? Number(extraPeriodMinutes) : null,
        per_session_target_minutes: perSessionMinutes.trim() ? Number(perSessionMinutes) : null,
        total_target_minutes: totalMinutes.trim() ? Number(totalMinutes) : null,
      });
      if (goalError) {
        setError("任务已创建，但目标保存失败 / Task created, goal failed: " + goalError.message);
        setBusy(false);
        router.refresh();
        return;
      }
    }

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
    setGoalEnabled(false);
    setGoalMetric("count");
    setGoalPeriod("week");
    setGoalValue("4");
    setExtraCount("");
    setExtraPeriodMinutes("");
    setPerSessionMinutes("");
    setTotalMinutes("");
    setTaskType("one_time");
    setPlanMode("flexible");
    setCadence("daily");setWeekdays([]);setTimesPerWeek(3);setRepeatEnd("");
    setSessionStart("");setSessionEnd("");setCrossDay(false);
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
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft">{zh?"任务类型":"Task type"}</p>
        <div className="grid grid-cols-3 gap-2">
          {([{value:"one_time",label:zh?"单次任务":"One-time",help:zh?"做完即结束":"Finish once"},{value:"planned",label:zh?"定期任务":"Planned",help:zh?"按期限完成":"Target finish"},{value:"habit",label:zh?"习惯养成":"Habit",help:zh?"长期记录":"Build a habit"}] as const).map(item=>
            <button key={item.value} type="button" disabled={busy} aria-pressed={taskType===item.value} onClick={()=>{setTaskType(item.value);if(item.value==="habit"){setCadence("weekly_quota");setGoalEnabled(true);setGoalPeriod("week");setGoalMetric("count");setGoalValue("3");setTimesPerWeek(3);}else if(item.value==="planned"){setGoalEnabled(false);}else{setGoalEnabled(false);}}}
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
          <p className="text-xs font-medium text-ink-soft">{zh?"习惯目标":"Habit goal"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"统计周期":"Period"}<select className={field+" mt-1"} value={goalPeriod} onChange={e=>{setGoalPeriod(e.target.value as typeof goalPeriod);setCadence(e.target.value==="day"?"daily":"weekly_quota");}} disabled={busy}><option value="day">{zh?"每天":"Day"}</option><option value="week">{zh?"每周":"Week"}</option><option value="month" disabled>{zh?"每月（待数据扩展）":"Month (coming later)"}</option></select></label>
            <label className="text-xs text-ink-soft">{zh?"目标次数":"Target count"}<input className={field+" mt-1"} type="number" min="1" step="1" value={goalValue} disabled={busy} onChange={e=>{setGoalValue(e.target.value);setTimesPerWeek(Math.min(7,Math.max(1,Number(e.target.value)||1)));}}/></label>
          </div>
          {goalPeriod==="week"&&Number(goalValue)>7&&<p className="text-xs text-amber-700">每周超过 7 次尚不支持，请改为 1–7 次。</p>}
          <p className="text-xs text-ink-faint">{zh?"默认灵活进行，不自动预约日历时段。目标只输入一次。":"Flexible by default; goal is entered once."}</p>
        </section>
      )}
      <details className="rounded-xl border border-line px-3 py-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-soft">{zh?"更多选项（可选）":"More options (optional)"}</summary>
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-ink-soft">{zh?"描述":"Description"}<textarea className={field+" mt-1 min-h-20"} value={description} onChange={e=>setDescription(e.target.value)} disabled={busy}/></label>
          <label className="block text-xs text-ink-soft">{zh?"分类":"Category"}<select className={field+" mt-1"} value={category??""} onChange={e=>setCategory(e.target.value as Category||null)} disabled={busy}><option value="">{zh?"不分类":"None"}</option>{CATEGORIES.map(c=><option key={c.value} value={c.value}>{t.categories[c.value]}</option>)}</select></label>
          {category==="other"&&<input className={field} value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder={zh?"自定义分类":"Custom tag"} disabled={busy}/>}
          {taskType==="one_time"&&<label className="block text-xs text-ink-soft">{zh?"预计投入（可选）":"Estimated effort (optional)"}<DurationInput value={minutes} unit={durationUnit} onValueChange={setMinutes} onUnitChange={setDurationUnit} disabled={busy}/></label>}
          {taskType==="habit"&&<label className="block text-xs text-ink-soft">{zh?"重复结束日期":"Repeat until"}<input type="date" className={field+" mt-1"} min={taskDate} value={repeatEnd} onChange={e=>setRepeatEnd(e.target.value)} disabled={busy}/></label>}
          
          {goalEnabled&&taskType==="habit"&&<div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"主要指标":"Metric"}<select className={field+" mt-1"} value={goalMetric} onChange={e=>setGoalMetric(e.target.value as typeof goalMetric)} disabled={busy}><option value="count">{zh?"次数":"Count"}</option><option value="duration">{zh?"分钟":"Minutes"}</option></select></label>
            {goalMetric==="duration"&&<label className="text-xs text-ink-soft">{zh?"目标分钟":"Target minutes"}<input className={field+" mt-1"} type="number" min="1" value={goalValue} onChange={e=>setGoalValue(e.target.value)} disabled={busy}/></label>}
          </div>}
          <label className="block text-xs text-ink-soft">{zh?"可见范围":"Visibility"}<select className={field+" mt-1"} value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)} disabled={busy}><option value="private">{zh?"仅自己":"Private"}</option><option value="space">{activeSpaceName}</option></select></label>
        </div>
      </details>
      <button className="btn-primary w-full" type="submit" disabled={busy}>{busy?(zh?"保存中…":"Saving..."):(zh?"创建任务":"Create task")}</button>
      {error&&<p role="alert" className="text-sm text-blush-500">{error}</p>}
    </form>
  );
}
