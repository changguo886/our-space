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

  const [taskType,setTaskType]=useState<"one_time"|"recurring"|"habit">("one_time");
  const [planMode,setPlanMode]=useState<"flexible"|"fixed">("flexible");
  const [cadence,setCadence]=useState<"daily"|"weekly_days"|"weekly_quota">("daily");
  const [weekdays,setWeekdays]=useState<number[]>([]);
  const [timesPerWeek,setTimesPerWeek]=useState(3);
  const [repeatEnd,setRepeatEnd]=useState("");
  const [sessionStart,setSessionStart]=useState("");
  const [sessionEnd,setSessionEnd]=useState("");
  const [crossDay,setCrossDay]=useState(false);
  const [longTerm, setLongTerm] = useState(false);
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
  const [endDate, setEndDate] = useState(taskDate);

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
    if (taskType!=="one_time") {
      if (cadence==="weekly_days" && weekdays.length===0) {
        setError("请选择至少一天 / Select at least one weekday"); return;
      }
      if (repeatEnd && repeatEnd < taskDate) {
        setError("重复结束日期不能早于开始日期 / Invalid repeat end date"); return;
      }
    }
    if (goalEnabled && taskType !== "one_time") {
      const required = Number(goalValue);
      const optional = [extraCount, extraPeriodMinutes, perSessionMinutes, totalMinutes];
      if (!Number.isSafeInteger(required) || required <= 0 ||
          optional.some(value => value.trim() !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0))) {
        setError("目标必须是正整数（时间以分钟计） / Goals must be positive integers (minutes for duration).");
        return;
      }
      // Weekly quota already defines its frequency. The goal uses the same value.
    }
    if (longTerm && endDate < startDate) { setError("结束日期不能早于开始日期 / End date must be after start date"); return; }
    setBusy(true);
    setError(null);

    const supabase =
      createClient();

    let created: { id: string } | null = null;
    let createError: { message: string } | null = null;
    if (taskType !== "one_time") {
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

    if (!error && created && goalEnabled && taskType !== "one_time") {
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

    if (!error && created && longTerm) {
      const { error: journeyError } = await supabase.from("goal_journeys").insert({todo_id:created.id,start_date:startDate,target_date:endDate,animal_type:"cat",journey_type:"swim",color_key:journeyColor});
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
    setLongTerm(false);
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
    setEndDate(taskDate);

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
          {([{value:"one_time",label:zh?"单次任务":"One-time",help:zh?"做完即结束":"Finish once"},{value:"recurring",label:zh?"定期任务":"Regular",help:zh?"每次独立完成":"Each occurrence"},{value:"habit",label:zh?"习惯养成":"Habit",help:zh?"长期记录":"Build a habit"}] as const).map(item=>
            <button key={item.value} type="button" disabled={busy} aria-pressed={taskType===item.value} onClick={()=>{setTaskType(item.value);if(item.value==="habit"){setCadence("weekly_quota");setGoalEnabled(true);setGoalPeriod("week");setGoalMetric("count");setGoalValue("3");setTimesPerWeek(3);}else if(item.value==="recurring"){setCadence("weekly_days");setGoalEnabled(false);}else{setGoalEnabled(false);}}}
              className={`min-w-0 rounded-xl border px-2 py-3 text-center transition ${taskType===item.value?"border-sage-400 bg-sage-50 text-sage-700":"border-line bg-white text-ink-soft hover:bg-paper"}`}>
              <span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[10px] opacity-70">{item.help}</span>
            </button>)}
        </div>
      </div>
      {taskType==="one_time" ? (
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
      ):taskType==="recurring"?(
        <section className="space-y-3 rounded-xl bg-paper/40 p-3">
          <label className="block text-xs font-medium text-ink-soft">{zh?"多久做一次？":"How often?"}
            <select className={field+" mt-1"} value={cadence} disabled={busy} onChange={e=>setCadence(e.target.value as typeof cadence)}>
              <option value="daily">{zh?"每天":"Daily"}</option>
              <option value="weekly_days">{zh?"每周指定星期":"Selected weekdays"}</option>
              <option value="weekly_quota">{zh?"每周若干次":"Times per week"}</option>
            </select>
          </label>
          {cadence==="weekly_days"&&<div className="flex flex-wrap gap-1.5">{["一","二","三","四","五","六","日"].map((d,i)=><button key={d} type="button" disabled={busy} aria-pressed={weekdays.includes(i+1)} onClick={()=>setWeekdays(v=>v.includes(i+1)?v.filter(x=>x!==i+1):[...v,i+1].sort())} className={`h-9 w-9 rounded-lg border text-xs ${weekdays.includes(i+1)?"border-sage-400 bg-sage-100 text-sage-800":"border-line bg-white"}`}>{d}</button>)}</div>}
          {cadence==="weekly_quota"&&<label className="block text-xs text-ink-soft">{zh?"每周次数":"Weekly count"}<select className={field+" mt-1"} disabled={busy} value={timesPerWeek} onChange={e=>setTimesPerWeek(Number(e.target.value))}>{[1,2,3,4,5,6,7].map(n=><option key={n}>{n}</option>)}</select></label>}
          <p className="text-xs text-sage-700">{zh?`执行目标自动参考：${cadence==="daily"?"每天 1 次":`每周 ${countFromPattern} 次`}`:`Suggested frequency: ${countFromPattern}`}</p>
        </section>
      ):(
        <section className="space-y-3 rounded-xl bg-paper/40 p-3">
          <p className="text-xs font-medium text-ink-soft">{zh?"希望坚持多少？":"Your habit goal"}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"统计周期":"Period"}<select className={field+" mt-1"} value={goalPeriod} onChange={e=>setGoalPeriod(e.target.value as typeof goalPeriod)} disabled={busy}><option value="day">{zh?"每天":"Day"}</option><option value="week">{zh?"每周":"Week"}</option><option value="month">{zh?"每月":"Month"}</option></select></label>
            <label className="text-xs text-ink-soft">{zh?"目标次数":"Target count"}<input className={field+" mt-1"} type="number" min="1" step="1" value={goalValue} disabled={busy} onChange={e=>{setGoalValue(e.target.value);setTimesPerWeek(Math.min(7,Math.max(1,Number(e.target.value)||1)));}}/></label>
          </div>
          <p className="text-xs text-ink-faint">{zh?"默认灵活进行，不自动预约日历时段。":"Flexible by default; no booked slots."}</p>
        </section>
      )}
      <details className="rounded-xl border border-line px-3 py-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-soft">{zh?"更多选项（可选）":"More options (optional)"}</summary>
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-ink-soft">{zh?"描述":"Description"}<textarea className={field+" mt-1 min-h-20"} value={description} onChange={e=>setDescription(e.target.value)} disabled={busy}/></label>
          <label className="block text-xs text-ink-soft">{zh?"分类":"Category"}<select className={field+" mt-1"} value={category??""} onChange={e=>setCategory(e.target.value as Category||null)} disabled={busy}><option value="">{zh?"不分类":"None"}</option>{CATEGORIES.map(c=><option key={c.value} value={c.value}>{t.categories[c.value]}</option>)}</select></label>
          {category==="other"&&<input className={field} value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder={zh?"自定义分类":"Custom tag"} disabled={busy}/>}
          <label className="block text-xs text-ink-soft">{zh?"预计投入（非必须连续完成）":"Effort estimate"}<DurationInput value={minutes} unit={durationUnit} onValueChange={setMinutes} onUnitChange={setDurationUnit} disabled={busy}/></label>
          {taskType!=="one_time"&&<label className="block text-xs text-ink-soft">{zh?"重复结束日期":"Repeat until"}<input type="date" className={field+" mt-1"} min={taskDate} value={repeatEnd} onChange={e=>setRepeatEnd(e.target.value)} disabled={busy}/></label>}
          {taskType!=="one_time"&&<label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={goalEnabled} onChange={e=>setGoalEnabled(e.target.checked)} disabled={busy}/>{zh?"额外保存周期目标":"Save period target"}</label>}
          {goalEnabled&&taskType!=="one_time"&&<div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">{zh?"主要指标":"Metric"}<select className={field+" mt-1"} value={goalMetric} onChange={e=>setGoalMetric(e.target.value as typeof goalMetric)} disabled={busy}><option value="count">{zh?"次数":"Count"}</option><option value="duration">{zh?"分钟":"Minutes"}</option></select></label>
            {goalMetric==="duration"&&<label className="text-xs text-ink-soft">{zh?"目标分钟":"Target minutes"}<input className={field+" mt-1"} type="number" min="1" value={goalValue} onChange={e=>setGoalValue(e.target.value)} disabled={busy}/></label>}
          </div>}
          <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={longTerm} onChange={e=>setLongTerm(e.target.checked)} disabled={busy}/>{zh?"开启成长旅程":"Enable Journey"}</label>
          {longTerm&&<div className="space-y-2">
            <label className="block text-xs text-ink-soft">{zh?"旅程开始":"Journey start"}<input type="date" className={field+" mt-1"} value={startDate} onChange={e=>setStartDate(e.target.value)} disabled={busy}/></label>
            <label className="block text-xs text-ink-soft">{zh?"旅程结束":"Journey end"}<input type="date" min={startDate} className={field+" mt-1"} value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={busy}/></label>
            <div className="flex flex-wrap gap-2">{([{id:"blue",hex:"#4B83D1"},{id:"green",hex:"#38A179"},{id:"purple",hex:"#9268C5"},{id:"orange",hex:"#DE9144"},{id:"pink",hex:"#D9769B"},{id:"teal",hex:"#329B9C"}] as const).map(c=><button type="button" key={c.id} aria-label={c.id} aria-pressed={journeyColor===c.id} onClick={()=>setJourneyColor(c.id)} className={`h-8 w-8 rounded-full border-4 ${journeyColor===c.id?"border-ink":"border-white"}`} style={{backgroundColor:c.hex}}/>)}</div>
          </div>}
          <label className="block text-xs text-ink-soft">{zh?"可见范围":"Visibility"}<select className={field+" mt-1"} value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)} disabled={busy}><option value="private">{zh?"仅自己":"Private"}</option><option value="space">{activeSpaceName}</option></select></label>
        </div>
      </details>
      <button className="btn-primary w-full" type="submit" disabled={busy||!title.trim()}>{busy?(zh?"保存中…":"Saving..."):(zh?"创建任务":"Create task")}</button>
      {error&&<p role="alert" className="text-sm text-blush-500">{error}</p>}
    </form>
  );
}
