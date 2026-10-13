"use client";

import { useEffect, useState } from "react";
import AppDatePicker from "@/components/ui/AppDatePicker";
import AppTimePicker from "@/components/ui/AppTimePicker";
import CopyDateCalendar from "@/components/ui/CopyDateCalendar";
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
  const [copySource,setCopySource]=useState<{id:string;day:string;mode:Mode;start:string;end:string;minutes:number}|null>(null);
  const [copyChoice,setCopyChoice]=useState<"all"|"weekdays"|"dates">("dates");
  const [copyDays,setCopyDays]=useState<string[]>([]);
  const [copyBusy,setCopyBusy]=useState(false);
  const [copyNotice,setCopyNotice]=useState("");
  const [continuationDays,setContinuationDays]=useState<string[]>([]);
  const [continuationItems,setContinuationItems]=useState<Array<{day:string;mode:Mode;start:string;end:string;minutes:number}>>([]);
  const [continuationSource,setContinuationSource]=useState<typeof copySource>(null);
  const [continuationBusy,setContinuationBusy]=useState(false);

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
  const sourceDay=copySource?.day??(mode==="fixed"?fixedStartDate:date);
  const sourceStart=copySource?.start??(mode==="fixed"?fixedStartTime:windowStart);
  const sourceEnd=copySource?.end??(mode==="fixed"?fixedEndTime:windowEnd);
  const copyMode=copySource?.mode??mode;
  const copyMinutes=copySource?.minutes??Number(minutes);
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
    if(copyMode==="fixed"&&(!validTime(sourceStart)||!validTime(sourceEnd)||sourceEnd<=sourceStart)){setError("请检查固定时间。");return;}
    if(copyMode==="window"&&(!validTime(sourceStart)||!validTime(sourceEnd)||sourceEnd<=sourceStart||copyMinutes>((Number(sourceEnd.slice(0,2))-Number(sourceStart.slice(0,2)))*60+Number(sourceEnd.slice(3))-Number(sourceStart.slice(3))))){setError("请检查时间窗口和预计分钟。");return;}
    setCopyBusy(true);
    const occupied=new Set([...plans.map(p=>p.plan_date),...sessions.map(p=>localDate(new Date(p.scheduled_start)))]);
    const target=copySelected.filter(day=>!occupied.has(day));
    const skipped=copySelected.length-target.length;
    if(!target.length){setCopyBusy(false);setCopyNotice(zh?"所选日期均已有单次安排，没有新增。":"All dates already have individual plans.");return;}
    // A repeating template represents many future virtual occurrences; do not bulk-create them.
    if(!copySource){setError(zh?"请先选择一条已保存安排作为来源。":"Choose a saved schedule to copy.");setCopyBusy(false);return;}
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
        ...key,execution_mode:copyMode,replaces_slot_key:null,
        start_time:copyMode==="fixed"?sourceStart:null,end_time:copyMode==="fixed"?sourceEnd:null,
        window_start:copyMode==="window"?sourceStart:null,window_end:copyMode==="window"?sourceEnd:null,
        planned_minutes:copyMode==="fixed"?null:copyMinutes
      }));
      const existing=records.some(record=>templates.some(t=>t.selector_kind===record.selector_kind&&t.selector_value===record.selector_value&&t.execution_mode===copyMode&&t.starts_on<=record.starts_on&&(t.ends_on===null||t.ends_on>=record.starts_on)));
      if(existing)writeError=zh?"已有相同日期规则的有效重复模板，请先修改该模板。":"A matching active template exists. Edit that series instead.";
      else {const x=await db.from("todo_execution_templates").insert(records);writeError=x.error?.message??"";}
    } else {
      // Dated copies are independent single sessions, safe for flexible weekly/monthly targets.
      const rows=target.map(day=>copyMode==="fixed"
        ?{todo_id:todoId,mode:"fixed",scheduled_start:toFixedDateTime(day,sourceStart).toISOString(),scheduled_end:toFixedDateTime(day,sourceEnd).toISOString()}
        :{todo_id:todoId,mode:copyMode,plan_date:day,planned_minutes:copyMinutes,window_start:copyMode==="window"?sourceStart:null,window_end:copyMode==="window"?sourceEnd:null});
      const x=await db.from("todo_sessions").insert(rows);writeError=x.error?.message??"";
    }
    setCopyBusy(false);
    if(writeError){setError((zh?"复制失败：":"Copy failed: ")+writeError);return;}
    setCopyNotice((zh?"复制完成；跳过已有单次安排 ":"Copied; skipped existing plans ")+skipped);
    if(pattern&&(pattern.period==="week"||pattern.period==="month")){
      const days=[...new Set([sourceDay,...target])].sort();
      setContinuationSource(copySource);setContinuationDays(days);
      setContinuationItems(days.map(day=>{
        const fixed=sessions.find(row=>localDate(new Date(row.scheduled_start))===day);
        const flexible=plans.find(row=>row.plan_date===day);
        if(day!==sourceDay&&target.includes(day))return {day,mode:copyMode,start:sourceStart,end:sourceEnd,minutes:copyMinutes};
        if(fixed){const a=new Date(fixed.scheduled_start),b=new Date(fixed.scheduled_end);return {day,mode:"fixed" as Mode,start:localTime(a),end:localTime(b),minutes:Math.round((b.getTime()-a.getTime())/60000)};}
        if(flexible)return {day,mode:flexible.mode,start:flexible.window_start?.slice(0,5)??"",end:flexible.window_end?.slice(0,5)??"",minutes:flexible.planned_minutes};
        return {day,mode:copyMode,start:sourceStart,end:sourceEnd,minutes:copyMinutes};
      }));
    }
    setCopyOpen(false);setCopySource(null);setCopyDays([]);await refresh();
  }
  const shiftPeriod=(day:string)=>{
    if(pattern?.period==="week")return addDaysISO(day,7);
    const [year,month,d]=day.split("-").map(Number);
    const next=new Date(Date.UTC(year,month,1));
    const max=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
    if(d>max)return null; // A 31st does not silently become the 30th.
    return [next.getUTCFullYear(),String(next.getUTCMonth()+1).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
  };
  const dismissContinuation=()=>{setContinuationDays([]);setContinuationItems([]);setContinuationSource(null);};
  async function applyContinuation(forever:boolean){
    if(!pattern||!continuationSource||!continuationDays.length)return;
    setError("");setContinuationBusy(true);
    const db=createClient();
    const items=continuationItems.map(item=>({...item,target:shiftPeriod(item.day)}))
      .filter((item):item is typeof item & {target:string}=>item.target!==null)
      .filter(item=>!projectEnd||item.target<=projectEnd)
      .filter(item=>pattern.arrangement==="flexible"||copyEligible(item.target));
    const occupied=new Set([...plans.map(p=>p.plan_date),...sessions.map(p=>localDate(new Date(p.scheduled_start)))]);
    let failure="";
    if(forever){
      const start=shiftPeriod(continuationDays[0]);
      if(!start||items.length===0){failure=zh?"下一周期没有符合条件的日期。":"No eligible dates next period.";}
      else {
        const rows=items.map(item=>({
          todo_id:todoId,starts_on:start,ends_on:projectEnd,timezone,replaces_slot_key:null,
          selector_kind:pattern.period==="week"?"weekday":"month_day",
          selector_value:pattern.period==="week"?weekdayISO(item.day):Number(item.day.slice(-2)),
          execution_mode:item.mode,
          start_time:item.mode==="fixed"?item.start:null,end_time:item.mode==="fixed"?item.end:null,
          window_start:item.mode==="window"?item.start:null,window_end:item.mode==="window"?item.end:null,
          planned_minutes:item.mode==="fixed"?null:item.minutes
        }));
        const keys=new Set(rows.map(row=>row.selector_kind+":"+row.selector_value));
        const conflicts=keys.size!==rows.length||rows.some(row=>templates.some(t=>t.selector_kind===row.selector_kind&&t.selector_value===row.selector_value&&(t.ends_on===null||t.ends_on>=start)));
        if(conflicts)failure=zh?"已有覆盖相同日期的重复安排，请先修改已有规则。":"An active recurring rule already covers these dates.";
        else {const result=await db.from("todo_execution_templates").insert(rows);failure=result.error?.message??"";}
      }
    } else {
      const newDays=items.filter(item=>!occupied.has(item.target));
      if(!newDays.length)failure=zh?"下一周期的对应日期都已有安排，或不存在可复制日期。":"There are no free matching dates next period.";
      else {
        const rows=newDays.map(item=>item.mode==="fixed"
          ?{todo_id:todoId,mode:"fixed",scheduled_start:toFixedDateTime(item.target,item.start).toISOString(),scheduled_end:toFixedDateTime(item.target,item.end).toISOString()}
          :{todo_id:todoId,mode:item.mode,plan_date:item.target,planned_minutes:item.minutes,window_start:item.mode==="window"?item.start:null,window_end:item.mode==="window"?item.end:null});
        const result=await db.from("todo_sessions").insert(rows);
        failure=result.error?.message??"";
      }
    }
    setContinuationBusy(false);
    if(failure){setError(failure);return;}
    dismissContinuation();setCopyNotice(forever?(zh?"已启用后续周期的虚拟重复安排。":"Future recurring plan saved."):(zh?"已复制到下一周期。":"Copied to next period."));
    await refresh();
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
    await refresh();setEditingTemplateId(null);setScope("once");setCopyOpen(false);setCopySource(null);setCopyNotice(zh?"已保存本次安排。可从上方记录点击「复制」。":"Saved. Use Copy on any existing schedule.");
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
      {plans.map(p=><div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper/60 px-3 py-2 text-xs text-ink-soft"><span>{p.plan_date} · {p.mode==="flexible"?(zh?"灵活安排":"Flexible"):(zh?"时间窗口":"Window")+" "+p.window_start?.slice(0,5)+"–"+p.window_end?.slice(0,5)} · {p.planned_minutes} min</span><button type="button" className="shrink-0 rounded-lg border border-line bg-white px-3 py-1.5 text-sage-700" onClick={()=>{setCopySource({id:p.id,day:p.plan_date,mode:p.mode,start:p.window_start?.slice(0,5)??"",end:p.window_end?.slice(0,5)??"",minutes:p.planned_minutes});setCopyChoice("dates");setCopyDays([]);setCopyOpen(true);setOpen(true);}}>{zh?"复制":"Copy"}</button></div>)}
      {sessions.map(session=><div key={session.id} className="flex items-center justify-between gap-3 rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700"><span>{zh?"固定时段":"Fixed"} · {new Date(session.scheduled_start).toLocaleString(zh?"zh-CN":"en-US")} – {new Date(session.scheduled_end).toLocaleTimeString(zh?"zh-CN":"en-US")}</span><button type="button" className="shrink-0 rounded-lg border border-line bg-white px-3 py-1.5" onClick={()=>{const first=new Date(session.scheduled_start),last=new Date(session.scheduled_end);setCopySource({id:session.id,day:localDate(first),mode:"fixed",start:localTime(first),end:localTime(last),minutes:Math.round((last.getTime()-first.getTime())/60000)});setCopyChoice("dates");setCopyDays([]);setCopyOpen(true);setOpen(true);}}>{zh?"复制":"Copy"}</button></div>)}
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
      {!editingTemplateId&&copySource&&copyOpen&&<div className="rounded-xl border border-line bg-paper/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <strong className="text-sm">{zh?"复制这条已保存的安排":"Copy saved schedule"}</strong>
          <button type="button" className="text-xs text-ink-faint underline" onClick={()=>{setCopyOpen(false);setCopySource(null);}}>{zh?"关闭":"Close"}</button>
        </div>
        <p className="text-xs text-ink-soft">{copySource.day} · {copySource.mode==="fixed"?copySource.start+"–"+copySource.end:copySource.mode==="window"?copySource.start+"–"+copySource.end+" · "+copySource.minutes+" min":copySource.minutes+" min"}</p>
        <div className="flex flex-wrap gap-2">
          {!isFlexibleQuota&&<button type="button" onClick={()=>setCopyChoice("all")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="all"?"border-sage-400 bg-sage-50":"border-line"}`}>{pattern?.arrangement==="fixed"?(zh?"全部规则日":"All rule days"):(zh?"剩余每天":"Remaining days")}</button>}
          {!isFlexibleQuota&&projectEnd&&<button type="button" onClick={()=>setCopyChoice("weekdays")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="weekdays"?"border-sage-400 bg-sage-50":"border-line"}`}>{zh?"剩余工作日":"Remaining weekdays"}</button>}
          <button type="button" onClick={()=>setCopyChoice("dates")} className={`rounded-lg border px-3 py-2 text-xs ${copyChoice==="dates"?"border-sage-400 bg-sage-50":"border-line"}`}>{isFlexibleQuota?(zh?"本周期选日期":"Choose this period"):(zh?"自己选日期":"Choose dates")}</button>
        </div>
        <CopyDateCalendar start={sourceDay} end={copyLimit} selected={copyChoice==="dates"?copyDays:copySelected} booked={[...bookedDates]} eligible={day=>copyEligible(day)&&(copyChoice==="dates"||copyChoice==="all"||weekdayISO(day)<=5)}
          onToggle={day=>{setCopyChoice("dates");setCopyDays(old=>old.includes(day)?old.filter(x=>x!==day):[...old,day]);}} zh={zh}/>
        <p className="text-xs text-ink-soft">{zh?"拟复制":"Proposed"} {copySelected.length} {zh?"天；已有安排":"days; existing"} {copySelected.filter(day=>bookedDates.has(day)).length} {zh?"天将跳过":"days will be skipped"}</p>
        <button type="button" disabled={copyBusy||copySelected.length===0} onClick={()=>void copySchedule()} className="btn-primary w-full">{copyBusy?(zh?"复制中…":"Copying…"):(zh?"复制到所选日期":"Copy to selected days")}</button>
      </div>}

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
      {copyNotice&&<p role="status" className="text-xs text-sage-700">{copyNotice}</p>}
    </div>}
    {continuationSource&&pattern&&<div role="dialog" aria-modal="true" aria-label={zh?"延续周期安排":"Continue recurring plan"} className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-ink">{pattern.period==="week"?(zh?"下周怎么安排？":"How about next week?"):(zh?"下个月怎么安排？":"How about next month?")}</h3>
        <p className="text-xs text-ink-soft">{zh?"本周期已保存的日期与时间方式可以沿用，完成次数不会增加。":"Reuse dates and timing next period; completion counts do not change."}</p>
        <div className="space-y-2">
          <button type="button" disabled={continuationBusy} onClick={dismissContinuation} className="w-full rounded-xl border border-line p-3 text-left text-sm">{pattern.period==="week"?(zh?"下周再决定":"Decide next week"):(zh?"下个月再决定":"Decide next month")}</button>
          <button type="button" disabled={continuationBusy} onClick={()=>void applyContinuation(false)} className="w-full rounded-xl border border-line p-3 text-left text-sm">{pattern.period==="week"?(zh?"下周沿用本周安排":"Reuse for next week"):(zh?"下个月沿用本月安排":"Reuse for next month")}</button>
          <button type="button" disabled={continuationBusy} onClick={()=>void applyContinuation(true)} className="w-full rounded-xl border border-sage-300 bg-sage-50 p-3 text-left text-sm text-sage-700">{pattern.period==="week"?(zh?"以后每周都这样":"Repeat every week"):(zh?"以后每月都这样":"Repeat every month")}</button>
        </div>
        {error&&<p role="alert" className="text-xs text-blush-500">{error}</p>}
      </div>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
