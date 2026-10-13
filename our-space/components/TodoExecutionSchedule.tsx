"use client";

import { useEffect, useState } from "react";
import AppDatePicker from "@/components/ui/AppDatePicker";
import AppTimePicker from "@/components/ui/AppTimePicker";
import { useI18n } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { addDaysISO, lastDayISO, weekdayISO, templateEligible, upcomingEligible, type HabitPatternV3, type ExecutionTemplateV3 } from "@/lib/recurring-execution";

type Mode = "flexible" | "window" | "fixed";
type DayPreset = { id:string; key:string; mode:Mode; start:string; end:string; minutes:string; windowStart:string; windowEnd:string; replaces:string };
type Plan = { id:string; mode:"flexible"|"window"; plan_date:string; planned_minutes:number; window_start:string|null; window_end:string|null };
type Session = { id:string; scheduled_start:string; scheduled_end:string };
function localDate(d:Date){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function localTime(d:Date){return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function validTime(value:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return false;return true;}
function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T12:00:00");return !Number.isNaN(d.getTime())&&localDate(d)===value;}
function toFixedDateTime(date:string,time:string){return new Date(date+"T"+time+":00");}
const field="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink";

export default function TodoExecutionSchedule({todoId}:{todoId:string}){
  const {language} = useI18n();
  const zh = language === "zh-CN";
  const [open,setOpen]=useState(false);
  const [scope,setScope]=useState<"once"|"all"|"by_day">("once");
  const [copyOpen,setCopyOpen]=useState(false);
  const [copyChoice,setCopyChoice]=useState<"all"|"weekdays"|"dates">("dates");
  const [copyDays,setCopyDays]=useState<string[]>([]);
  const [copyBusy,setCopyBusy]=useState(false);
  const [copyNotice,setCopyNotice]=useState("");

  const [selector,setSelector]=useState("all");
  const [dayPresets,setDayPresets]=useState<DayPreset[]>([]);
  const [sharedStart,setSharedStart]=useState("18:00");
  const [sharedEnd,setSharedEnd]=useState("19:00");
  const [sharedMode,setSharedMode]=useState<Mode>("fixed");
  const [sharedMinutes,setSharedMinutes]=useState("45");
  const [copyFrom,setCopyFrom]=useState("");
  const [copyTo,setCopyTo]=useState<string[]>([]);
  const [showCopyConfirm,setShowCopyConfirm]=useState(false);
  const makePreset=(key:string):DayPreset=>({id:crypto.randomUUID(),key,mode:"fixed",start:"09:00",end:"10:00",minutes:"45",windowStart:"08:00",windowEnd:"12:00",replaces:""});
  const [replaceSlotKey,setReplaceSlotKey]=useState("");
  const [pattern,setPattern]=useState<HabitPatternV3|null>(null);
  const [todoStart,setTodoStart]=useState("");
  const [projectEnd,setProjectEnd]=useState<string|null>(null);
  const [templates,setTemplates]=useState<ExecutionTemplateV3[]>([]);
  const [timezone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC");
  const [editingTemplateId,setEditingTemplateId]=useState<string|null>(null);
  const [overrideSlot,setOverrideSlot]=useState("");
  const [overrideDate,setOverrideDate]=useState(()=>localDate(new Date()));
  const [overrideStart,setOverrideStart]=useState("09:00");
  const [overrideEnd,setOverrideEnd]=useState("10:00");
  const [overrideAction,setOverrideAction]=useState<"cancel"|"reschedule">("reschedule");
  const [mode,setMode]=useState<Mode>("flexible");
  const [date,setDate]=useState(()=>localDate(new Date()));
  const [minutes,setMinutes]=useState("45");
  const [windowStart,setWindowStart]=useState("18:00");
  const [windowEnd,setWindowEnd]=useState("22:00");
  const [fixedStartDate,setFixedStartDate]=useState(()=>localDate(new Date()));
  const [fixedStartTime,setFixedStartTime]=useState(()=>localTime(new Date()));
  const [fixedEndDate,setFixedEndDate]=useState(()=>localDate(new Date(Date.now()+45*60000)));
  const [fixedEndTime,setFixedEndTime]=useState(()=>localTime(new Date(Date.now()+45*60000)));
  const [plans,setPlans]=useState<Plan[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  async function refresh(){
    setLoading(true);
    const db=createClient();
    const [p,s,h,t,td]=await Promise.all([
      db.from("todo_sessions").select("id,mode,plan_date,planned_minutes,window_start,window_end").eq("todo_id",todoId).neq("mode","fixed").order("plan_date",{ascending:false}),
      db.from("todo_sessions").select("id,scheduled_start,scheduled_end").eq("todo_id",todoId).eq("mode","fixed").order("scheduled_start",{ascending:false}),
      db.from("habit_patterns_v3").select("todo_id,period,arrangement,target_count,weekdays,month_days,include_month_end").eq("todo_id",todoId).maybeSingle(),
      db.from("todo_execution_templates").select("id,todo_id,slot_key,starts_on,ends_on,execution_mode,selector_kind,selector_value,start_time,end_time,timezone,planned_minutes,window_start,window_end,replaces_slot_key").eq("todo_id",todoId),
      db.from("todos").select("task_date,plan_start_date,target_finish_date").eq("id",todoId).single()
    ]);
    if(p.error)setError("读取灵活安排失败（请确认已执行 V4 Session schema）："+p.error.message);
    else if(s.error)setError("读取预约时段失败："+s.error.message);
    else {setPlans((p.data??[]) as Plan[]);setSessions((s.data??[]) as Session[]);setError(t.error?t.error.message:"");if(!h.error)setPattern(h.data as HabitPatternV3|null);if(!t.error)setTemplates((t.data??[]) as ExecutionTemplateV3[]);if(!td.error&&td.data){setTodoStart(td.data.plan_start_date??td.data.task_date??"");setProjectEnd(td.data.target_finish_date??null);}}
    setLoading(false);
  }
  useEffect(()=>{void refresh();},[todoId]);
  // Existing dated flexible/window plans are preserved when introducing a new future series.
  // Protect today's already finished execution; never rewrite past periods.
  // Future standalone plans remain separate and must not force the entire series past them.
  const todayISO=localDate(new Date());
  const hasPastOrTodaySingle=plans.some(p=>p.plan_date<=todayISO)||sessions.some(session=>localDate(new Date(session.scheduled_start))<=todayISO);
  const autoSeriesDate=scope!=="once"&&!editingTemplateId&&date<=todayISO&&hasPastOrTodaySingle
    ? addDaysISO(todayISO,1) : date;
  // When switching to a new repeat series, show its actual proposed start in the date field.
  const onScopeChange=(next:"once"|"all"|"by_day")=>{
    setScope(next);
    if(next!=="once"&&!editingTemplateId&&date<=todayISO&&hasPastOrTodaySingle)setDate(addDaysISO(todayISO,1));
    setSelector("all");
    setReplaceSlotKey(next==="by_day"?templates.find(t=>t.selector_kind==="all")?.slot_key??"":"");
  };
  const bookedDates=new Set([...plans.map(p=>p.plan_date),...sessions.map(x=>localDate(new Date(x.scheduled_start)))]);
  const resetDraft=()=>{
    setEditingTemplateId(null);setScope("once");setSelector("all");setMode("flexible");
    setDate(localDate(new Date()));setMinutes("45");setDayPresets([]);setCopyFrom("");setCopyTo([]);
    setReplaceSlotKey("");setShowCopyConfirm(false);setError("");
  };



  const applyShared=()=>setDayPresets(rows=>rows.map(row=>({...row,mode:sharedMode,start:sharedStart,end:sharedEnd,windowStart:sharedStart,windowEnd:sharedEnd,minutes:sharedMinutes})));
  const sourceDay=mode==="fixed"?fixedStartDate:date;
  const sourceStart=mode==="fixed"?fixedStartTime:windowStart;
  const sourceEnd=mode==="fixed"?fixedEndTime:windowEnd;
  const isFlexibleQuota=Boolean(pattern?.arrangement==="flexible"&&pattern.period!=="day");
  const lastOfPeriod=(day:string)=>{
    const [year,month]=day.split("-").map(Number);
    if(pattern?.period==="week"){const weekEnd=addDaysISO(day,7-weekdayISO(day));return weekEnd;}
    return [year,String(month).padStart(2,"0"),String(new Date(year,month,0).getDate()).padStart(2,"0")].join("-");
  };
  const copyLimit=isFlexibleQuota?lastOfPeriod(sourceDay):projectEnd??addDaysISO(sourceDay,27);
  const candidateDays=Array.from({length:Math.max(0,Math.min(90,Math.floor((Date.parse(copyLimit+"T12:00:00Z")-Date.parse(sourceDay+"T12:00:00Z"))/86400000)))},(_,i)=>addDaysISO(sourceDay,i+1));
  const copyEligible=(day:string)=>!pattern||pattern.arrangement==="flexible"||pattern.period==="day"||
    pattern.period==="week"&&pattern.weekdays.includes(weekdayISO(day))||
    pattern.period==="month"&&(pattern.month_days.includes(Number(day.slice(-2)))||(pattern.include_month_end&&Number(day.slice(-2))===lastDayISO(day)));
  const copyAvailable=candidateDays.filter(copyEligible);
  const copySelected=copyChoice==="dates"?copyDays:copyAvailable.filter(day=>copyChoice==="all"||weekdayISO(day)<=5);
  async function copySchedule(){
    setCopyNotice("");setError("");
    const db=createClient();
    if(!validDate(sourceDay)||!copySelected.length){setError(zh?"请选择要复制到的日期。":"Choose destination dates.");return;}
    if(mode==="fixed"&&(!validTime(sourceStart)||!validTime(sourceEnd)||sourceEnd<=sourceStart)){setError("请检查固定时间。");return;}
    if(mode==="window"&&(!validTime(sourceStart)||!validTime(sourceEnd)||sourceEnd<=sourceStart||Number(minutes)>((Number(sourceEnd.slice(0,2))-Number(sourceStart.slice(0,2)))*60+Number(sourceEnd.slice(3))-Number(sourceStart.slice(3))))){setError("请检查时间窗口和预计分钟。");return;}
    setCopyBusy(true);
    const occupied=new Set([...plans.map(p=>p.plan_date),...sessions.map(p=>localDate(new Date(p.scheduled_start)))]);
    const target=copySelected.filter(day=>!occupied.has(day));
    const skipped=copySelected.length-target.length;
    if(!target.length){setCopyBusy(false);setCopyNotice(zh?"所选日期均已有单次安排，没有新增。":"All dates already have individual plans.");return;}
    // A repeating template represents many future virtual occurrences; do not bulk-create them.
    const recurring=!isFlexibleQuota&&copyChoice!=="dates"&&Boolean(projectEnd||pattern?.arrangement==="fixed"||pattern?.period==="day");
    let writeError="";
    if(recurring){
      const selectors=pattern?.period==="week"&&pattern.arrangement==="fixed"
        ?pattern.weekdays.filter(n=>copyChoice!=="weekdays"||n<=5).map(n=>({selector_kind:"weekday",selector_value:n}))
        :pattern?.period==="month"&&pattern.arrangement==="fixed"
        ?[...pattern.month_days.map(n=>({selector_kind:"month_day",selector_value:n})),...(pattern.include_month_end?[{selector_kind:"month_end",selector_value:null}]:[])]
        :copyChoice==="weekdays"?[1,2,3,4,5].map(n=>({selector_kind:"weekday",selector_value:n})):[{selector_kind:"all",selector_value:null}];
      const records=selectors.map(key=>({
        todo_id:todoId,starts_on:addDaysISO(sourceDay,1),ends_on:projectEnd,timezone,
        ...key,execution_mode:mode,replaces_slot_key:null,
        start_time:mode==="fixed"?sourceStart:null,end_time:mode==="fixed"?sourceEnd:null,
        window_start:mode==="window"?sourceStart:null,window_end:mode==="window"?sourceEnd:null,
        planned_minutes:mode==="fixed"?null:Number(minutes)
      }));
      const existing=records.some(record=>templates.some(t=>t.selector_kind===record.selector_kind&&t.selector_value===record.selector_value&&t.execution_mode===mode&&t.starts_on<=record.starts_on&&(t.ends_on===null||t.ends_on>=record.starts_on)));
      if(existing)writeError=zh?"已有相同日期规则的有效重复模板，请先修改该模板。":"A matching active template exists. Edit that series instead.";
      else {const x=await db.from("todo_execution_templates").insert(records);writeError=x.error?.message??"";}
    } else {
      // Dated copies are independent single sessions, safe for flexible weekly/monthly targets.
      const rows=target.map(day=>mode==="fixed"
        ?{todo_id:todoId,mode:"fixed",scheduled_start:toFixedDateTime(day,sourceStart).toISOString(),scheduled_end:toFixedDateTime(day,sourceEnd).toISOString()}
        :{todo_id:todoId,mode,plan_date:day,planned_minutes:Number(minutes),window_start:mode==="window"?sourceStart:null,window_end:mode==="window"?sourceEnd:null});
      const x=await db.from("todo_sessions").insert(rows);writeError=x.error?.message??"";
    }
    setCopyBusy(false);
    if(writeError){setError((zh?"复制失败：":"Copy failed: ")+writeError);return;}
    setCopyNotice((zh?"复制完成；跳过已有单次安排 ":"Copied; skipped existing plans ")+skipped);
    setCopyOpen(false);setCopyDays([]);await refresh();
  }
  async function save(){
    setError("");
    if(scope!=="by_day"&&mode!=="fixed"&&(!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440)){setError("计划投入需为 1–1440 分钟。");return;}
    if(scope!=="by_day"&&mode==="window"){
      const startMinutes=Number(windowStart.slice(0,2))*60+Number(windowStart.slice(3));
      const endMinutes=Number(windowEnd.slice(0,2))*60+Number(windowEnd.slice(3));
      if(!validTime(windowStart)||!validTime(windowEnd)||endMinutes<=startMinutes||Number(minutes)>endMinutes-startMinutes){
        setError(zh?"请检查时间窗口：结束须晚于开始，预计投入不能超过窗口时长。":"Check the time window: end must follow start and planned minutes must fit.");
        return;
      }
    }
    if(scope==="once"&&mode==="fixed"&&(!validDate(fixedStartDate)||!validDate(fixedEndDate)||!validTime(fixedStartTime)||!validTime(fixedEndTime))){setError("请填写有效日期（YYYY-MM-DD）与24小时制时间（HH:mm）。");return;}
    if(scope==="once"&&mode==="fixed"&&toFixedDateTime(fixedEndDate,fixedEndTime).getTime()<=toFixedDateTime(fixedStartDate,fixedStartTime).getTime()){setError("固定结束时间必须晚于开始时间。");return;}
    setSaving(true);
    const db=createClient();
    const repeating=scope!=="once";
    const selected=selector.split(":");
    const selectorKind=scope==="all"?"all":selected[0];
    const selectorValue=scope==="all"?null:selected[1]?Number(selected[1]):null;
    if(repeating&&!validDate(date)){setSaving(false);setError("请选择有效的重复安排生效日期。");return;}
    if(repeating&&replaceSlotKey&&!templates.some(t=>t.slot_key===replaceSlotKey&&t.selector_kind==="all")){
      setSaving(false);setError("请选择本任务有效的默认时段。");return;
    }

    if(repeating&&!pattern&&!projectEnd){setSaving(false);setError("此任务没有重复规则或计划结束日期，请使用单次安排。");return;}
    if(repeating&&pattern?.arrangement==="flexible"&&pattern.period!=="day"){
      setSaving(false);setError(zh?"灵活次数没有指定重复日期。请先在任务规则中改为固定日期，或仅安排一次。":"Flexible quotas have no recurring dates. Change the routine rule to fixed dates, or schedule a single session.");return;
    }
    if(repeating&&scope!=="by_day"&&mode==="fixed"&&(fixedStartTime>=fixedEndTime||!validTime(fixedStartTime)||!validTime(fixedEndTime))){setSaving(false);setError("重复固定时段必须在同一天内结束，且结束时间晚于开始时间。");return;}
    const effectiveStart=autoSeriesDate<todoStart?todoStart:autoSeriesDate;
    if(repeating&&scope!=="by_day"&&!editingTemplateId&&templates.some(t=>
      t.selector_kind===selectorKind&&t.selector_value===selectorValue&&
      t.starts_on<=effectiveStart&&(t.ends_on===null||effectiveStart<=t.ends_on)&&
      t.execution_mode===mode&&
      (mode!=="fixed"||(t.start_time?.slice(0,5)===fixedStartTime&&t.end_time?.slice(0,5)===fixedEndTime))&&
      (mode!=="window"||(t.window_start?.slice(0,5)===windowStart&&t.window_end?.slice(0,5)===windowEnd))&&
      (mode==="fixed"||t.planned_minutes===Number(minutes))
    )){setSaving(false);setError("相同的重复安排已经存在，请直接修改原模板。");return;}
    if(scope==="by_day"&&!editingTemplateId){
      if(dayPresets.length===0){setSaving(false);setError("请至少选择一个具体星期或月日期。");return;}
      const validKeys=new Set<string>();
      if(pattern?.period==="week"){
        for(const day of pattern.arrangement==="fixed"?pattern.weekdays:[1,2,3,4,5,6,7])validKeys.add("weekday:"+day);
      }else if(pattern?.period==="month"){
        for(const day of pattern.arrangement==="fixed"?pattern.month_days:Array.from({length:31},(_,i)=>i+1))validKeys.add("month_day:"+day);
        if(pattern.include_month_end)validKeys.add("month_end");
      }else if(!pattern&&projectEnd){
        for(let day=1;day<=7;day++)validKeys.add("weekday:"+day);
      }
      const keys=dayPresets.map(row=>row.key);
      if(keys.some(key=>!validKeys.has(key))){
        setSaving(false);setError(zh?"请选择符合当前任务规则的日期。":"Choose dates matching this task rule.");return;
      }
      const slotKeys=new Set<string>();
      for(const row of dayPresets){
        const signature=[row.key,row.mode,row.mode==="fixed"?row.start+"-"+row.end:row.mode==="window"?row.windowStart+"-"+row.windowEnd+"-"+row.minutes:row.minutes,row.replaces].join("|");
        if(slotKeys.has(signature)){setSaving(false);setError(zh?"存在重复时段，请调整后重试。":"Duplicate execution slots. Please revise.");return;}
        slotKeys.add(signature);
        if(row.mode==="window"&&validTime(row.windowStart)&&validTime(row.windowEnd)&&Number(row.minutes)>((Number(row.windowEnd.slice(0,2))*60+Number(row.windowEnd.slice(3)))-(Number(row.windowStart.slice(0,2))*60+Number(row.windowStart.slice(3))))){setSaving(false);setError(zh?"预计投入不能超过时间窗口长度。":"Planned minutes cannot exceed the window.");return;}
        if(row.mode==="fixed"&&(!validTime(row.start)||!validTime(row.end)||row.end<=row.start)){
          setSaving(false);setError("请检查每个固定时段的开始与结束时间。");return;
        }
        if(row.mode==="window"&&(!validTime(row.windowStart)||!validTime(row.windowEnd)||row.windowEnd<=row.windowStart)){
          setSaving(false);setError("请检查时间窗口。");return;
        }
        if(row.mode!=="fixed"&&(!Number.isInteger(Number(row.minutes))||Number(row.minutes)<1||Number(row.minutes)>1440)){
          setSaving(false);setError("灵活安排和时间窗口的投入必须为 1–1440 分钟。");return;
        }
        if(row.replaces&&!templates.some(t=>t.slot_key===row.replaces&&t.selector_kind==="all")){
          setSaving(false);setError("替换的默认时段不存在。");return;
        }
        if(templates.some(t=>t.selector_kind===row.key.split(":")[0]&&t.selector_value===(row.key.includes(":")?Number(row.key.split(":")[1]):null)
          &&t.starts_on<=effectiveStart&&(t.ends_on===null||effectiveStart<=t.ends_on)
          &&t.execution_mode===row.mode
          &&(row.mode!=="fixed"||(t.start_time?.slice(0,5)===row.start&&t.end_time?.slice(0,5)===row.end))
          &&(row.mode!=="window"||(t.window_start?.slice(0,5)===row.windowStart&&t.window_end?.slice(0,5)===row.windowEnd))
          &&(row.mode==="fixed"||t.planned_minutes===Number(row.minutes)))){
          setSaving(false);setError("选中的日期已有重复模板，请先修改或停止原模板，避免重复。");return;
        }
      }
      for(let i=0;i<dayPresets.length;i++)for(let j=i+1;j<dayPresets.length;j++){
        const a=dayPresets[i],b=dayPresets[j];
        if(a.key===b.key&&a.mode==="fixed"&&b.mode==="fixed"&&a.start<b.end&&b.start<a.end){setSaving(false);setError(zh?"同一天的固定时段不能重叠。":"Fixed slots on the same day cannot overlap.");return;}
      }
      const records=dayPresets.map(row=>({
        todo_id:todoId,starts_on:effectiveStart,ends_on:projectEnd,timezone,
        selector_kind:row.key.split(":")[0],selector_value:row.key.includes(":")?Number(row.key.split(":")[1]):null,
        execution_mode:row.mode,replaces_slot_key:row.replaces||null,
        start_time:row.mode==="fixed"?row.start:null,end_time:row.mode==="fixed"?row.end:null,
        window_start:row.mode==="window"?row.windowStart:null,window_end:row.mode==="window"?row.windowEnd:null,
        planned_minutes:row.mode==="fixed"?null:Number(row.minutes),
      }));
      const {error:batchError}=await db.from("todo_execution_templates").insert(records);
      setSaving(false);
      if(batchError){setError("批量保存失败："+batchError.message);return;}
      await refresh();setOpen(false);setDayPresets([]);return;
    }
    const result=repeating&&editingTemplateId
      ? await db.rpc("revise_execution_template_v3",{
          p_template_id:editingTemplateId,
          p_effective_on:effectiveStart,
          p_new_mode:mode,
          p_start_time:mode==="fixed"?fixedStartTime:null,
          p_end_time:mode==="fixed"?fixedEndTime:null,
          p_window_start:mode==="window"?windowStart:null,
          p_window_end:mode==="window"?windowEnd:null,
          p_planned_minutes:mode==="fixed"?null:Number(minutes),
        })
      : repeating
      ? await db.from("todo_execution_templates").insert({
          todo_id:todoId,starts_on:effectiveStart,ends_on:projectEnd,
          timezone,execution_mode:mode,selector_kind:selectorKind,selector_value:selectorValue,
          replaces_slot_key:scope==="by_day"?(replaceSlotKey||null):null,
          start_time:mode==="fixed"?fixedStartTime:null,end_time:mode==="fixed"?fixedEndTime:null,
          window_start:mode==="window"?windowStart:null,window_end:mode==="window"?windowEnd:null,
          planned_minutes:mode==="fixed"?null:Number(minutes),
        })
      : mode==="fixed" ? await db.from("todo_sessions").insert({todo_id:todoId,scheduled_start:toFixedDateTime(fixedStartDate,fixedStartTime).toISOString(),scheduled_end:toFixedDateTime(fixedEndDate,fixedEndTime).toISOString()}) : await db.from("todo_sessions").insert({todo_id:todoId,plan_date:date,mode,planned_minutes:Number(minutes),window_start:mode==="window"?windowStart:null,window_end:mode==="window"?windowEnd:null});
    setSaving(false);
    if(result.error){
      const missingFlexibleColumns=scope==="once"&&mode!=="fixed"&&result.error.message.includes("scheduled_start")&&result.error.message.includes("not-null");
      setError(missingFlexibleColumns
        ? (zh?"当前数据库仍强制要求预约开始时间，无法保存灵活投入或时间窗口。请先核对并执行经过备份确认的 V4 Session 兼容迁移；系统不会自动添加虚假时间。":"The database still requires scheduled_start. Flexible/window plans need the reviewed V4 Session migration. No artificial time will be added.")
        : (zh?"保存失败：":"Save failed: ")+result.error.message);
      return;
    }
    await refresh();setEditingTemplateId(null);setScope("once");setCopyOpen(true);setCopyNotice(zh?"本次已保存。需要的话可继续复制到其他日期。":"Saved. You may now copy to other dates.");
  }
  async function saveOverride(){
    const t=templates.find(x=>x.id===overrideSlot);
    if(!t){setError("请先选择重复安排。");return;}
    if(!validDate(overrideDate)||overrideDate<t.starts_on||(t.ends_on&&overrideDate>t.ends_on)){setError("请选择模板有效期内的日期。");return;}
    if(!templateEligible(overrideDate,t,pattern??undefined,todoStart||undefined)){setError("这一天不属于所选重复模板的执行日期。");return;}
    if(overrideAction==="reschedule"&&(!validTime(overrideStart)||!validTime(overrideEnd)||overrideEnd<=overrideStart)){setError("改期时间必须是同一天内有效的开始和结束时间。");return;}
    setSaving(true);const change=overrideAction==="cancel"?{scheduled_start:null,scheduled_end:null}:{
      scheduled_start:toFixedDateTime(overrideDate,overrideStart).toISOString(),
      scheduled_end:toFixedDateTime(overrideDate,overrideEnd).toISOString(),
    };
    const {error:writeError}=await createClient().from("todo_execution_overrides").upsert({
      todo_id:todoId,slot_key:t.slot_key,occurrence_date:overrideDate,action:overrideAction,...change
    },{onConflict:"todo_id,slot_key,occurrence_date"});
    setSaving(false);
    if(writeError){setError("保存单次调整失败："+writeError.message);return;}
    setError("");await refresh();
  }
  const preview = pattern
    ? upcomingEligible(pattern,todoStart||autoSeriesDate,autoSeriesDate,800,40).filter(day=>{
        if(scope!=="by_day")return true;
        if(dayPresets.length>0)return dayPresets.some(p=>p.key==="weekday:"+weekdayISO(day)||p.key==="month_day:"+Number(day.slice(-2))||(p.key==="month_end"&&Number(day.slice(-2))===lastDayISO(day)));
        const [kind,value]=selector.split(":");
        return kind==="weekday"?weekdayISO(day)===Number(value)
          :kind==="month_day"?Number(day.slice(-2))===Number(value)
          :kind==="month_end"?Number(day.slice(-2))===lastDayISO(day):false;
      }).slice(0,3)
    : projectEnd ? Array.from({length:Math.min(90,Math.max(0,Math.round((new Date(projectEnd+"T12:00").getTime()-new Date(autoSeriesDate+"T12:00").getTime())/86400000)+1))},(_,i)=>addDaysISO(autoSeriesDate,i))
        .filter(day=>day>=(todoStart||date)&&(scope!=="by_day"||selector==="all"||(selector.startsWith("weekday:")&&weekdayISO(day)===Number(selector.split(":")[1])))).slice(0,3)
      : [];
  return <section className="mt-4 rounded-xl border border-line bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-ink">{zh?"执行安排":"Execution schedule"}</h3><p className="text-xs text-ink-faint">{zh?"只有固定时段占用日历时间格；灵活次数不自动预约。":"Only fixed slots book calendar time; flexible quotas remain unallocated."}</p></div>
      <button type="button" className="rounded-lg border border-sage-300 px-3 py-2 text-xs text-sage-700" onClick={()=>setOpen(v=>!v)}>{open?(zh?"收起":"Close"):(zh?"＋ 安排执行":"+ Plan execution")}</button>
    </div>
    {loading?<p className="mt-3 text-xs text-ink-faint">读取安排中…</p>:<div className="mt-3 space-y-1.5">
      {plans.map(p=><div key={p.id} className="rounded-lg bg-paper/60 px-3 py-2 text-xs text-ink-soft">{p.plan_date} · {p.mode==="flexible"?(zh?"灵活安排":"Flexible"):(zh?"时间窗口":"Window")+` ${p.window_start?.slice(0,5)}–${p.window_end?.slice(0,5)}`} · {p.planned_minutes} {zh?"分钟":"min"}</div>)}
      {sessions.map(s=><div key={s.id} className="rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">{zh?"固定时段":"Fixed slot"} · {new Date(s.scheduled_start).toLocaleString(zh?"zh-CN":"en-US")} – {new Date(s.scheduled_end).toLocaleTimeString(zh?"zh-CN":"en-US")}</div>)}
      {templates.map(t=><div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-sage-50 px-3 py-2 text-xs text-sage-700"><span>未来重复 · {t.selector_kind==="all"?"所有符合日期":t.selector_kind==="weekday"?"星期"+t.selector_value:t.selector_kind==="month_day"?"每月"+t.selector_value+"日":"月末"} · {t.execution_mode==="fixed"?t.start_time?.slice(0,5)+"–"+t.end_time?.slice(0,5):t.execution_mode==="window"?"时间窗口":"灵活安排"} · 从 {t.starts_on}</span><span className="flex shrink-0 gap-2"><button type="button" className="underline" onClick={()=>{setEditingTemplateId(t.id);setScope("all");setOpen(true);setDate(t.starts_on>date?t.starts_on:date);setMode(t.execution_mode);setFixedStartTime(t.start_time?.slice(0,5)??"09:00");setFixedEndTime(t.end_time?.slice(0,5)??"10:00");setWindowStart(t.window_start?.slice(0,5)??"08:00");setWindowEnd(t.window_end?.slice(0,5)??"12:00");setMinutes(String(t.planned_minutes??45));}}>从这天起修改</button><button type="button" className="underline" onClick={async()=>{const effective=date<t.starts_on?t.starts_on:date;if(!window.confirm("停止从 "+effective+" 起的重复安排？之前的时间计划保留。"))return;const x=await createClient().rpc("stop_execution_template_future_v3",{p_template_id:t.id,p_effective_on:effective});if(x.error)setError(x.error.message);else await refresh();}}>停止后续</button></span></div>)}
      {!plans.length&&!sessions.length&&!templates.length&&<p className="text-xs text-ink-faint">{zh?"尚无执行安排。可以先不安排。":"No execution plans yet. You can schedule later."}</p>}
    </div>}
    {templates.some(t=>t.execution_mode==="fixed")&&<details className="mt-4 rounded-xl border border-line p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink-soft">{zh?"修改／取消某一次固定预约":"Change or cancel one fixed occurrence"}</summary>
      <div className="mt-3 space-y-2">
        <label className="block text-xs text-ink-soft">重复时段<select className={field+" mt-1"} value={overrideSlot} onChange={e=>setOverrideSlot(e.target.value)}><option value="">请选择</option>{templates.filter(t=>t.execution_mode==="fixed").map(t=><option key={t.id} value={t.id}>{t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)} · {t.selector_kind==="all"?"所有日期":t.selector_kind==="weekday"?(zh?"星期":"Weekday ")+t.selector_value:t.selector_kind==="month_day"?(zh?"每月":"Day ")+t.selector_value:(zh?"月末":"Month end")}</option>)}</select></label>
        <label className="block text-xs text-ink-soft">{zh?"只调整这一天":"Occurrence date"}<AppDatePicker value={overrideDate} onChange={setOverrideDate}/></label>
        <div className="grid grid-cols-2 gap-2">{(["reschedule","cancel"] as const).map(x=><button key={x} type="button" className={`rounded-lg border p-2 text-xs ${overrideAction===x?"border-sage-400 bg-sage-50":"border-line"}`} onClick={()=>setOverrideAction(x)}>{x==="cancel"?(zh?"取消这一次":"Cancel once"):(zh?"仅这次改时间":"Reschedule once")}</button>)}</div>
        {overrideAction==="reschedule"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">开始<AppTimePicker value={overrideStart} onChange={v=>setOverrideStart(v)}/></label><label className="text-xs text-ink-soft">结束<AppTimePicker value={overrideEnd} onChange={v=>setOverrideEnd(v)}/></label></div>}
        <button type="button" disabled={saving||!overrideSlot} className="btn-primary w-full" onClick={()=>void saveOverride()}>{saving?(zh?"保存中…":"Saving…"):(zh?"仅保存这一次":"Save this occurrence")}</button>
      </div>
    </details>}
    {open&&<div className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{editingTemplateId?(zh?"修改之后的重复安排":"Edit future recurrence"):(zh?"安排一次":"Schedule once")}</h4>
        <button type="button" onClick={resetDraft} className="text-xs text-ink-faint underline">{zh?"清空当前输入":"Reset draft"}</button>
      </div>
      {editingTemplateId&&<p className="rounded-lg bg-sage-50 p-3 text-xs text-sage-700">{zh?"仅从指定日期起更新，历史安排不变。":"Updates from the selected date; historical occurrences remain."}</p>}
      {editingTemplateId
        ? <label className="block text-xs text-ink-soft">{zh?"从这天起":"Effective from"}<AppDatePicker value={date} onChange={setDate}/></label>
        : mode==="fixed"
          ? <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-soft">{zh?"开始日期":"Start date"}<AppDatePicker value={fixedStartDate} onChange={v=>{setFixedStartDate(v);setFixedEndDate(v);}}/></label>
              <label className="text-xs text-ink-soft">{zh?"结束日期":"End date"}<AppDatePicker value={fixedEndDate} onChange={setFixedEndDate}/></label>
            </div>
          : <label className="block text-xs text-ink-soft">{zh?"执行日期":"Execution date"}<AppDatePicker value={date} onChange={setDate}/></label>}
      <div className="grid grid-cols-3 gap-2">
        {(["flexible","window","fixed"] as const).map(next=><button key={next} type="button" aria-pressed={mode===next} onClick={()=>setMode(next)}
          className={`rounded-lg border px-2 py-2 text-xs ${mode===next?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>
          {next==="fixed"?(zh?"固定时段":"Fixed"):next==="window"?(zh?"时间窗口":"Window"):(zh?"灵活投入":"Flexible")}
        </button>)}
      </div>
      {mode!=="flexible"&&<div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">{zh?"开始时间":"Start"}<AppTimePicker value={mode==="fixed"?fixedStartTime:windowStart} onChange={mode==="fixed"?setFixedStartTime:setWindowStart}/></label>
        <label className="text-xs text-ink-soft">{zh?"结束时间":"End"}<AppTimePicker value={mode==="fixed"?fixedEndTime:windowEnd} onChange={mode==="fixed"?setFixedEndTime:setWindowEnd}/></label>
      </div>}
      {mode!=="fixed"&&<label className="block text-xs text-ink-soft">{zh?"预计投入（分钟）":"Planned minutes"}<input className={field+" mt-1"} type="number" min="1" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>}
      {!editingTemplateId&&<button type="button" className="text-xs text-sage-700 underline underline-offset-2" onClick={()=>{
        const last=sessions[0],plan=plans[0];
        if(last){const a=new Date(last.scheduled_start),b=new Date(last.scheduled_end);setMode("fixed");setFixedStartTime(localTime(a));setFixedEndTime(localTime(b));}
        else if(plan){setMode(plan.mode);setMinutes(String(plan.planned_minutes));setWindowStart(plan.window_start?.slice(0,5)??"18:00");setWindowEnd(plan.window_end?.slice(0,5)??"22:00");}
        else setError(zh?"暂无历史安排可沿用":"No previous timing to reuse");
      }}>{zh?"沿用最近一次时间":"Reuse last timing"}</button>}
      <button type="button" disabled={saving} className="btn-primary w-full" onClick={()=>void save()}>
        {saving?(zh?"保存中…":"Saving…"):editingTemplateId?(zh?"保存以后安排":"Save future schedule"):(zh?"保存这一次":"Save this occurrence")}
      </button>
      {!editingTemplateId&&<div className="rounded-xl border border-line bg-paper/30 p-3 space-y-3">
        <button type="button" onClick={()=>setCopyOpen(v=>!v)} className="flex w-full items-center justify-between text-left text-sm font-medium">
          <span>{zh?"复制到其他日期…":"Copy to other dates…"}</span><span>{copyOpen?"−":"＋"}</span>
        </button>
        {copyOpen&&<>
          <p className="text-xs text-ink-faint">{zh?"沿用上方的日期和时间设置；已单独安排的日期会保留。先保存本次，再复制到其他日期。":"Reuse the time above. Save the first occurrence before copying; dated plans are preserved."}</p>
          <div className="flex flex-wrap gap-2">
            {!isFlexibleQuota&&<button type="button" onClick={()=>setCopyChoice("all")} aria-pressed={copyChoice==="all"} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="all"?"border-sage-400 bg-sage-50":"border-line"}`}>{pattern?.arrangement==="fixed"?(zh?"所有固定规则日":"Every rule day"):(zh?"剩余每天":"Remaining days")}</button>}
            {!isFlexibleQuota&&projectEnd&&<button type="button" onClick={()=>setCopyChoice("weekdays")} aria-pressed={copyChoice==="weekdays"} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="weekdays"?"border-sage-400 bg-sage-50":"border-line"}`}>{zh?"剩余工作日":"Remaining weekdays"}</button>}
            <button type="button" onClick={()=>setCopyChoice("dates")} aria-pressed={copyChoice==="dates"} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="dates"?"border-sage-400 bg-sage-50":"border-line"}`}>{isFlexibleQuota?(zh?"本周期选日期":"Dates this period"):(zh?"自选日期":"Choose dates")}</button>
          </div>
          {copyChoice==="dates"&&<div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-7">
            {copyAvailable.map(day=><button key={day} type="button" aria-pressed={copyDays.includes(day)} onClick={()=>setCopyDays(xs=>xs.includes(day)?xs.filter(x=>x!==day):[...xs,day])} className={`rounded-lg border p-2 text-xs ${copyDays.includes(day)?"border-sage-400 bg-sage-50":"border-line"}`}>{day.slice(5)}</button>)}
          </div>}
          <p className="text-xs text-ink-faint">{zh?"选择":"Selected"} {copySelected.length} {zh?"个日期。已有单次计划不会被覆盖。":"dates; existing individual plans stay intact."}</p>
          <button type="button" disabled={copyBusy||copySelected.length===0} onClick={()=>void copySchedule()} className="btn-primary w-full">
            {copyBusy?(zh?"复制中…":"Copying…"):(zh?"应用复制安排":"Apply copy")}
          </button>
        </>}
      </div>}
      {copyNotice&&<p role="status" className="text-xs text-sage-700">{copyNotice}</p>}
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
