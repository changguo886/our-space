"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { CalendarDays, Clock3 } from "lucide-react";
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
  const workDateRef = useRef<HTMLInputElement>(null);
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

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-line bg-white/80 p-4">
        <p className="mb-2 text-sm font-medium text-ink">{dictionary.common?.minutes==="分钟"?"任务类型":"Task type"}</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            {value:"one_time",zh:"单次任务",en:"One-time"},
            {value:"recurring",zh:"定期任务",en:"Regular"},
            {value:"habit",zh:"习惯养成",en:"Habit"},
          ] as const).map(item=>(
            <button key={item.value} type="button" disabled={busy}
              aria-pressed={taskType===item.value}
              onClick={()=>setTaskType(item.value)}
              className={`rounded-xl border px-2 py-3 text-center text-xs transition-colors duration-200 ${taskType===item.value?"border-sage-300 bg-sage-50 font-semibold text-sage-700":"border-line bg-paper/40 text-ink-soft hover:bg-white"}`}>
              {dictionary.common?.minutes==="分钟"?item.zh:item.en}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {taskType==="habit"
            ? (dictionary.common?.minutes==="分钟"?"追踪持续行为与目标频率；打卡将在后续 Habit 工作区完成。":"Track ongoing behavior and target frequency; check-ins come in the Habit workspace.")
            : taskType==="recurring"
              ? (dictionary.common?.minutes==="分钟"?"每次发生有独立的完成状态。":"Each occurrence has its own completion outcome.")
              : (dictionary.common?.minutes==="分钟"?"完成一次后任务结束，可选择灵活或指定时段。":"Complete once, with flexible or specific-time scheduling.")}
        </p>
      </div>
      {/* 任务名称 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          {t.task}
        </label>

        <input
          className="input"
          placeholder={t.taskPlaceholder}
          value={title}
          onChange={(e) =>
            setTitle(
              e.target.value
            )
          }
          disabled={busy}
        />
      </div>

      {/* 任务细节 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          {t.taskDetails}
        </label>

        <textarea
          className="input min-h-[96px] w-full resize-y"
          placeholder={t.detailsPlaceholder}
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          disabled={busy}
        />

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          {t.detailsHelp}
        </p>
      </div>

      {/* 分类 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs text-ink-faint">
            {t.category}
          </label>

          {category && (
            <button
              type="button"
              onClick={() =>
                setCategory(null)
              }
              className="text-[11px] text-ink-faint transition hover:text-ink-soft"
            >
              {dictionary.common.clear}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(
            (item) => {
              const selected =
                category ===
                item.value;

              return (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCategory(
                      item.value
                    );

                    /*
                     * 如果切换到非 other，
                     * 自动清掉之前的自定义标签。
                     */
                    if (
                      item.value !==
                      "other"
                    ) {
                      setCustomTag(
                        ""
                      );
                    }
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    selected
                      ? "border-sage-300 bg-sage-100 font-medium text-sage-700"
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

      {/* 其他分类自定义标签 */}
      {category === "other" && (
        <div>
          <label className="mb-1.5 block text-xs text-ink-faint">
            {t.customTag}
          </label>

          <input
            className="input"
            placeholder={t.customTagPlaceholder}
            value={customTag}
            onChange={(e) =>
              setCustomTag(
                e.target.value
              )
            }
            disabled={busy}
          />
        </div>
      )}

      {/* 预计时间 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          {t.estimatedTime}
        </label>

        <DurationInput
          value={minutes}
          unit={durationUnit}
          onValueChange={
            setMinutes
          }
          onUnitChange={
            setDurationUnit
          }
          disabled={busy}
        />

        <p className="mt-1.5 text-[11px] text-ink-faint">
          {t.durationHelp}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-white/80 p-4">
        <p className="mb-2 text-sm font-medium text-ink">{dictionary.common?.minutes==="分钟"?"安排时间":"Schedule time"}</p>
        {taskType==="one_time" && <div className="grid grid-cols-2 gap-2">
          {(["flexible","fixed"] as const).map(mode=><button key={mode} type="button" disabled={busy}
            aria-pressed={planMode===mode} onClick={()=>setPlanMode(mode)}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${planMode===mode?"border-sage-300 bg-sage-50 font-semibold text-sage-700":"border-line bg-paper/40 text-ink-soft"}`}>
            {mode==="flexible"?(dictionary.common?.minutes==="分钟"?"灵活安排":"Flexible"):mode==="fixed"?(dictionary.common?.minutes==="分钟"?"指定时段":"Specific time"):(dictionary.common?.minutes==="分钟"?"重复计划":"Repeat")}
          </button>)}
        </div>}
        {taskType!=="one_time" && <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-ink-soft">
            {dictionary.common?.minutes==="分钟"?"重复方式":"Repeat pattern"}
            <select className="input mt-1 w-full" value={cadence} disabled={busy}
              onChange={e=>setCadence(e.target.value as typeof cadence)}>
              <option value="daily">{dictionary.common?.minutes==="分钟"?"每天":"Every day"}</option>
              <option value="weekly_days">{dictionary.common?.minutes==="分钟"?"每周指定日期":"Specific weekdays"}</option>
              <option value="weekly_quota">{dictionary.common?.minutes==="分钟"?"每周目标次数":"Times per week"}</option>
            </select>
          </label>
          {cadence==="weekly_days" && <div>
            <p className="mb-2 text-xs text-ink-soft">{dictionary.common?.minutes==="分钟"?"选择星期（周一至周日）":"Choose weekdays (Monday to Sunday)"}</p>
            <div className="flex flex-wrap gap-2">
              {(dictionary.common?.minutes==="分钟"?["一","二","三","四","五","六","日"]:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map((day,i)=>
                <button key={i} type="button" disabled={busy} aria-pressed={weekdays.includes(i+1)}
                  onClick={()=>setWeekdays(current=>current.includes(i+1)?current.filter(x=>x!==i+1):[...current,i+1].sort())}
                  className={`rounded-lg border px-3 py-2 text-xs ${weekdays.includes(i+1)?"border-sage-400 bg-sage-100 text-sage-800":"border-line bg-white text-ink-soft"}`}>{day}</button>)}
            </div>
          </div>}
          {cadence==="weekly_quota" && <label className="block text-xs text-ink-soft">
            {dictionary.common?.minutes==="分钟"?"每周次数":"Times per week"}
            <select className="input mt-1 w-full" disabled={busy} value={timesPerWeek}
              onChange={e=>setTimesPerWeek(Number(e.target.value))}>
              {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>}
          <label className="block text-xs text-ink-soft">
            {dictionary.common?.minutes==="分钟"?"结束日期（可选）":"End date (optional)"}
            <input className="input mt-1 w-full" type="date" disabled={busy} min={taskDate}
              value={repeatEnd} onChange={e=>setRepeatEnd(e.target.value)}/>
          </label>
          <p className="text-xs text-ink-faint">{dictionary.common?.minutes==="分钟"?"保存重复规则，不会自动创建未来日历时段。":"Save a repeat rule without auto-booking calendar sessions."}</p>
        </div>}
        {taskType==="one_time" && planMode==="fixed" ? <div className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-ink-soft">{dictionary.common?.minutes==="分钟"?"工作日期":"Work date"}</label>
            <div className="flex min-h-[52px] items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100">
              <CalendarDays className="h-4 w-4 shrink-0 text-sage-700"/>
              <button type="button" disabled={busy} onClick={() => {
                const input=workDateRef.current;
                if (!input) return;
                try { input.showPicker(); } catch { input.focus(); input.click(); }
              }} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink">
                {formatWorkDate(sessionStart,dictionary.common?.minutes==="分钟")}
              </button>
              <input ref={workDateRef} aria-label={dictionary.common?.minutes==="分钟"?"选择工作日期":"Choose work date"}
                type="date" value={sessionStart.slice(0,10)} disabled={busy}
                onChange={e=>{const day=e.target.value;if(!day)return;setSessionStart(day+"T"+(sessionStart.slice(11)||"14:00"));setSessionEnd((crossDay?sessionEnd.slice(0,10)||day:day)+"T"+(sessionEnd.slice(11)||"16:00"));}}
                className="h-9 w-10 shrink-0 cursor-pointer text-transparent outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([{key:"start",label:dictionary.common?.minutes==="分钟"?"开始":"Start",value:sessionStart},{key:"end",label:dictionary.common?.minutes==="分钟"?"结束":"End",value:sessionEnd}] as const).map(item=>
              <label key={item.key} className="min-w-0">
                <span className="mb-2 block text-xs font-semibold text-ink-soft">{item.label}</span>
                <span className="flex min-h-[52px] items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100">
                  <Clock3 className="h-4 w-4 shrink-0 text-sage-700"/>
                  <input type="time" step={300} value={item.value.slice(11)} disabled={busy}
                    onChange={e=>{const date=item.key==="start"?sessionStart.slice(0,10):crossDay?sessionEnd.slice(0,10):sessionStart.slice(0,10);
                      if(item.key==="start")setSessionStart(date+"T"+e.target.value);else setSessionEnd(date+"T"+e.target.value);
                    }}
                    className="w-full min-w-0 bg-transparent text-base font-medium text-ink outline-none"/>
                </span>
              </label>)}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" checked={crossDay} disabled={busy} onChange={e=>{setCrossDay(e.target.checked);if(!e.target.checked&&sessionStart)setSessionEnd(sessionStart.slice(0,10)+"T"+(sessionEnd.slice(11)||"16:00"));}}/>
            {dictionary.common?.minutes==="分钟"?"跨天结束":"Ends on another day"}
          </label>
          {crossDay && <label className="block text-xs font-medium text-ink-soft">
            {dictionary.common?.minutes==="分钟"?"结束日期":"End date"}
            <input type="date" min={sessionStart.slice(0,10)||undefined} value={sessionEnd.slice(0,10)} disabled={busy}
              onChange={e=>setSessionEnd(e.target.value+"T"+(sessionEnd.slice(11)||"16:00"))}
              className="input mt-2 w-full"/>
          </label>}
          <p className="text-xs text-ink-faint">{dictionary.common?.minutes==="分钟"?"仅安排这一次；以后可以在 Calendar 中拖动或新增时段。":"One session only; adjust or add sessions in Calendar later."}</p>
        </div>:taskType==="one_time"?<p className="mt-3 text-xs text-ink-faint">{dictionary.common?.minutes==="分钟"?"先创建任务，不占用日历时间；以后再手动安排。":"Create the task without booking time; schedule it later."}</p>:null}
      </div>

      {taskType !== "one_time" && (
        <section className="rounded-2xl border border-line bg-white/80 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={goalEnabled} onChange={e => setGoalEnabled(e.target.checked)} disabled={busy} />
            {dictionary.common?.minutes === "分钟" ? "执行目标（可选）" : "Progress goals (optional)"}
          </label>
          <p className="text-xs text-ink-faint">{dictionary.common?.minutes === "分钟" ? "重复方式决定何时执行；执行目标决定希望完成多少。" : "Schedule defines when; goals define how much."}</p>
          {goalEnabled && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-ink-soft">主要目标 / Primary metric
                  <select className="input mt-1 w-full" value={goalMetric} disabled={busy} onChange={e => setGoalMetric(e.target.value as "count" | "duration")}>
                    <option value="count">完成次数 / Count</option>
                    <option value="duration">累计分钟 / Minutes</option>
                  </select>
                </label>
                <label className="text-xs text-ink-soft">统计周期 / Period
                  <select className="input mt-1 w-full" value={goalPeriod} disabled={busy} onChange={e => setGoalPeriod(e.target.value as "day" | "week" | "month")}>
                    <option value="day">每天 / Day</option>
                    <option value="week">每周 / Week</option>
                    <option value="month">每月 / Month</option>
                  </select>
                </label>
              </div>
              {cadence === "weekly_quota" && goalPeriod === "week" && goalMetric === "count" ?
                <p className="rounded-xl bg-sage-50 p-3 text-sm text-sage-700">每周 {timesPerWeek} 次（与上方重复规则同步）</p> :
                <label className="block text-xs text-ink-soft">{goalMetric === "count" ? "周期目标次数 / Target count" : "周期目标分钟数 / Target minutes"}
                  <input className="input mt-1 w-full" type="number" min="1" step="1" value={goalValue} disabled={busy} onChange={e => setGoalValue(e.target.value)} />
                </label>}
              <details className="rounded-xl bg-paper/50 p-3">
                <summary className="cursor-pointer text-xs font-medium text-ink-soft">额外目标 / Advanced goals</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {goalMetric === "count" ? (
                    <label className="text-xs text-ink-soft">周期累计分钟 / Period minutes
                      <input className="input mt-1 w-full" type="number" min="1" step="1" value={extraPeriodMinutes} onChange={e => setExtraPeriodMinutes(e.target.value)} disabled={busy}/>
                    </label>
                  ) : (
                    <label className="text-xs text-ink-soft">周期次数 / Period count
                      <input className="input mt-1 w-full" type="number" min="1" step="1" value={extraCount} onChange={e => setExtraCount(e.target.value)} disabled={busy}/>
                    </label>
                  )}
                  <label className="text-xs text-ink-soft">单次目标分钟 / Per-session minutes
                    <input className="input mt-1 w-full" type="number" min="1" step="1" value={perSessionMinutes} onChange={e => setPerSessionMinutes(e.target.value)} disabled={busy}/>
                  </label>
                  <label className="text-xs text-ink-soft">整个项目累计分钟 / Total minutes
                    <input className="input mt-1 w-full" type="number" min="1" step="1" value={totalMinutes} onChange={e => setTotalMinutes(e.target.value)} disabled={busy}/>
                  </label>
                </div>
              </details>
              <p className="text-xs text-ink-faint">目标是计划值，真实专注时间由 Focus 记录自动统计。</p>
            </div>
          )}
        </section>
      )}

      <div className="rounded-2xl border border-line bg-paper/40 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={longTerm} onChange={e=>setLongTerm(e.target.checked)} disabled={busy} />
          {dictionary.common?.minutes === "分钟" ? "开启成长旅程（可选）" : "Enable growth Journey (optional)"}
        </label>
        {longTerm && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-ink-soft">{dictionary.common?.minutes === "分钟" ? "开始日期" : "Start date"}
            <input className="input mt-1 w-full" type="date" value={startDate} onChange={e=>{setStartDate(e.target.value);if(endDate<e.target.value)setEndDate(e.target.value);}} disabled={busy}/>
          </label>
          <label className="text-xs text-ink-soft">{dictionary.common?.minutes === "分钟" ? "目标结束日期" : "Target end date"}
            <input className="input mt-1 w-full" type="date" min={startDate} value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={busy}/>
          </label>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs text-ink-soft">旅程颜色 / Journey color</p>
            <div className="flex flex-wrap gap-2">
              {([{key:"blue",hex:"#4B83D1"},{key:"green",hex:"#38A179"},{key:"purple",hex:"#9268C5"},{key:"orange",hex:"#DE9144"},{key:"pink",hex:"#D9769B"},{key:"teal",hex:"#329B9C"}] as const).map(c=>
                <button key={c.key} type="button" disabled={busy} onClick={()=>setJourneyColor(c.key)} aria-pressed={journeyColor===c.key}
                  aria-label={c.key} title={c.key} className={`h-9 w-9 rounded-full border-4 transition-transform ${journeyColor===c.key?"border-ink scale-110":"border-white hover:scale-105"}`}
                  style={{backgroundColor:c.hex}} />
              )}
            </div>
          </div>
          <p className="text-xs text-ink-faint sm:col-span-2">{dictionary.common?.minutes === "分钟" ? "创建后可在 Calendar 的旅程视图中调整日期。" : "Adjust journey dates later in Calendar."}</p>
        </div>}
      </div>

      {/* 可见范围 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          {t.visibility}
        </label>

        <select
          className="input"
          value={visibility}
          onChange={(e) =>
            setVisibility(
              e.target.value as
                | "private"
                | "space"
            )
          }
          disabled={busy}
        >
          <option value="private">
            {t.privateVisibility}
          </option>

          <option value="space">
            {t.shareToSpace.replace("{space}", activeSpaceName)}
          </option>
        </select>
      </div>

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy}
      >
        {busy
          ? t.adding
          : t.addTask}
      </button>

      {error && (
        <p className="text-sm text-blush-500">
          {error}
        </p>
      )}
    </form>
  );
}
