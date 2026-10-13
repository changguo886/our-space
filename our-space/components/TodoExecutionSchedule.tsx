"use client";

import { useEffect, useState } from "react";
import AppDatePicker from "@/components/ui/AppDatePicker";
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
  const [selector,setSelector]=useState("all");
  const [dayPresets,setDayPresets]=useState<DayPreset[]>([]);
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
    const effectiveStart=date<todoStart?todoStart:date;
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
          p_effective_on:date,
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
    await refresh();setOpen(false);setEditingTemplateId(null);
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
    ? upcomingEligible(pattern,todoStart||date,date,800,40).filter(day=>{
        if(scope!=="by_day")return true;
        if(dayPresets.length>0)return dayPresets.some(p=>p.key==="weekday:"+weekdayISO(day)||p.key==="month_day:"+Number(day.slice(-2))||(p.key==="month_end"&&Number(day.slice(-2))===lastDayISO(day)));
        const [kind,value]=selector.split(":");
        return kind==="weekday"?weekdayISO(day)===Number(value)
          :kind==="month_day"?Number(day.slice(-2))===Number(value)
          :kind==="month_end"?Number(day.slice(-2))===lastDayISO(day):false;
      }).slice(0,3)
    : projectEnd ? Array.from({length:Math.min(90,Math.max(0,Math.round((new Date(projectEnd+"T12:00").getTime()-new Date(date+"T12:00").getTime())/86400000)+1))},(_,i)=>addDaysISO(date,i))
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
        <label className="block text-xs text-ink-soft">重复时段<select className={field+" mt-1"} value={overrideSlot} onChange={e=>setOverrideSlot(e.target.value)}><option value="">请选择</option>{templates.filter(t=>t.execution_mode==="fixed").map(t=><option key={t.id} value={t.id}>{t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)} · {t.selector_kind==="all"?"所有日期":t.selector_kind+" "+(t.selector_value??"末日")}</option>)}</select></label>
        <label className="block text-xs text-ink-soft">{zh?"只调整这一天":"Occurrence date"}<AppDatePicker value={overrideDate} onChange={setOverrideDate}/></label>
        <div className="grid grid-cols-2 gap-2">{(["reschedule","cancel"] as const).map(x=><button key={x} type="button" className={`rounded-lg border p-2 text-xs ${overrideAction===x?"border-sage-400 bg-sage-50":"border-line"}`} onClick={()=>setOverrideAction(x)}>{x==="cancel"?(zh?"取消这一次":"Cancel once"):(zh?"仅这次改时间":"Reschedule once")}</button>)}</div>
        {overrideAction==="reschedule"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">开始<input type="time" className={field+" mt-1"} value={overrideStart} onChange={e=>setOverrideStart(e.target.value)}/></label><label className="text-xs text-ink-soft">结束<input type="time" className={field+" mt-1"} value={overrideEnd} onChange={e=>setOverrideEnd(e.target.value)}/></label></div>}
        <button type="button" disabled={saving||!overrideSlot} className="btn-primary w-full" onClick={()=>void saveOverride()}>{saving?(zh?"保存中…":"Saving…"):(zh?"仅保存这一次":"Save this occurrence")}</button>
      </div>
    </details>}
    {open&&<div className="mt-4 space-y-3 border-t border-line pt-4">
      {editingTemplateId&&<p className="rounded-lg bg-sage-50 p-2 text-xs text-sage-700">正在修改已保存的重复安排。日期表示「从这天开始采用新时间」，更早的执行模板保留。<button type="button" className="ml-2 underline" onClick={()=>setEditingTemplateId(null)}>取消修改</button></p>}
      <p className="text-xs font-semibold text-ink-soft">{zh?"第一步 · 应用范围":"Step 1 · Scope"}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([{id:"once",label:zh?"仅安排一次":"One time"},{id:"all",label:zh?"统一安排":"Uniform schedule"},{id:"by_day",label:zh?"自定义安排":"Custom schedule"}] as const).map(x=><button key={x.id} type="button" disabled={Boolean(editingTemplateId)} aria-pressed={scope===x.id} onClick={()=>{setScope(x.id);setSelector("all");setReplaceSlotKey(x.id==="by_day"?[...new Set(templates.filter(t=>t.selector_kind==="all").map(t=>t.slot_key))].length===1?templates.find(t=>t.selector_kind==="all")?.slot_key??"":"":"");}} className={`rounded-lg border px-2 py-2 text-xs ${scope===x.id?"border-sage-400 bg-sage-50":"border-line"}`}>{x.label}</button>)}
      </div>
      {scope==="by_day"&&!editingTemplateId&&<div className="space-y-3 rounded-xl border border-line bg-paper/30 p-3">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-ink-soft">{zh?"为不同日期设置时间":"Configure different dates"}</p><span className="text-xs text-ink-faint">{dayPresets.length} {zh?"个时段":"slots"}</span></div>
        <div className="flex flex-wrap gap-1.5">
          {(pattern?.period==="week"?(pattern.arrangement==="fixed"?pattern.weekdays:[1,2,3,4,5,6,7]).map(n=>({key:"weekday:"+n,label:"周"+"一二三四五六日"[n-1]}))
          :pattern?.period==="month"?[...(pattern.arrangement==="fixed"?pattern.month_days:Array.from({length:31},(_,i)=>i+1)).map(n=>({key:"month_day:"+n,label:n+"日"})),...(pattern.include_month_end?[{key:"month_end",label:"月末"}]:[])]
          :!pattern&&projectEnd?[1,2,3,4,5,6,7].map(n=>({key:"weekday:"+n,label:"周"+"一二三四五六日"[n-1]})):[]).map(item=><button key={item.key} type="button" aria-pressed={dayPresets.some(x=>x.key===item.key)} disabled={saving} onClick={()=>setDayPresets(rows=>rows.some(x=>x.key===item.key)?rows.filter(x=>x.key!==item.key):[...rows,makePreset(item.key)])} className={`rounded-lg border px-2.5 py-2 text-xs ${dayPresets.some(x=>x.key===item.key)?"border-sage-400 bg-sage-50":"border-line bg-white"}`}>{item.label}</button>)}
        </div>
        {dayPresets.map((row,index)=><div key={row.id} className="space-y-2 rounded-xl border border-line bg-white p-3">
          <div className="flex items-center justify-between"><strong className="text-xs text-ink">{row.key==="month_end"?"每月最后一天":row.key.startsWith("weekday:")?"每周星期"+"一二三四五六日"[Number(row.key.split(":")[1])-1]:"每月 "+row.key.split(":")[1]+" 日"}</strong><button type="button" className="text-xs text-ink-faint underline" onClick={()=>setDayPresets(rows=>rows.filter(x=>x.id!==row.id))}>移除</button></div>
          <div className="grid grid-cols-3 gap-1">{(["flexible","window","fixed"] as const).map(next=><button key={next} type="button" aria-pressed={row.mode===next} className={`rounded-lg border p-1.5 text-xs ${row.mode===next?"border-sage-400 bg-sage-50":"border-line"}`} onClick={()=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,mode:next}:x))}>{next==="flexible"?"灵活":next==="window"?"时间窗口":"固定时段"}</button>)}</div>
          {row.mode==="fixed"?<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">开始<input type="time" className={field+" mt-1"} value={row.start} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,start:e.target.value}:x))}/></label><label className="text-xs text-ink-soft">结束<input type="time" className={field+" mt-1"} value={row.end} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,end:e.target.value}:x))}/></label></div>:<>
            <label className="block text-xs text-ink-soft">每次预计投入（分钟）<input type="number" min="1" max="1440" className={field+" mt-1"} value={row.minutes} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,minutes:e.target.value}:x))}/></label>
            {row.mode==="window"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">最早开始<input type="time" className={field+" mt-1"} value={row.windowStart} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,windowStart:e.target.value}:x))}/></label><label className="text-xs text-ink-soft">最晚结束<input type="time" className={field+" mt-1"} value={row.windowEnd} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,windowEnd:e.target.value}:x))}/></label></div>}
          </>}
          {templates.some(t=>t.selector_kind==="all")&&<label className="block text-xs text-ink-soft">和默认安排的关系<select className={field+" mt-1"} value={row.replaces} onChange={e=>setDayPresets(rows=>rows.map((x,i)=>i===index?{...x,replaces:e.target.value}:x))}><option value="">额外增加一段</option>{[...new Map(templates.filter(t=>t.selector_kind==="all").map(t=>[t.slot_key,t])).values()].map(t=><option key={t.slot_key} value={t.slot_key}>替换默认 {t.start_time?.slice(0,5)??t.execution_mode}</option>)}</select></label>}
        </div>)}
        <div className="flex flex-wrap gap-2">{[...new Set(dayPresets.map(x=>x.key))].map(key=><button key={key} type="button" className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-soft" onClick={()=>setDayPresets(rows=>[...rows,makePreset(key)])}>{zh?"＋ 添加时段":"＋ Add slot"} · {key}</button>)}</div>
        {dayPresets.length>0&&<div className="space-y-2 rounded-xl border border-line bg-white p-3">
          <p className="text-xs font-semibold">{zh?"复制日期安排":"Copy day schedule"}</p>
          <select className={field} value={copyFrom} onChange={e=>{setCopyFrom(e.target.value);setCopyTo([]);}}><option value="">{zh?"选择来源日期":"Select source day"}</option>{[...new Set(dayPresets.map(x=>x.key))].map(key=><option key={key} value={key}>{key}</option>)}</select>
          <div className="flex flex-wrap gap-1">{[...new Set(dayPresets.map(x=>x.key))].filter(key=>key!==copyFrom).map(key=><button key={key} type="button" aria-pressed={copyTo.includes(key)} className={`rounded-lg border px-2 py-1.5 text-xs ${copyTo.includes(key)?"border-sage-400 bg-sage-50":"border-line"}`} onClick={()=>setCopyTo(old=>old.includes(key)?old.filter(v=>v!==key):[...old,key])}>{key}</button>)}</div>
          <button type="button" disabled={!copyFrom||copyTo.length===0} className="rounded-lg border border-sage-300 px-3 py-2 text-xs text-sage-700 disabled:opacity-50" onClick={()=>setShowCopyConfirm(true)}>{zh?"复制到所选日期":"Copy to selected days"}</button>
          {showCopyConfirm&&<div className="rounded-lg bg-paper p-3 text-xs"><p>{zh?"将替换目标日期当前草稿的时段，不影响已保存的历史。":"This replaces target-day slots in the current draft, not saved history."}</p><div className="mt-2 flex gap-2"><button type="button" className="rounded-lg border px-2 py-1" onClick={()=>setShowCopyConfirm(false)}>{zh?"取消":"Cancel"}</button><button type="button" className="rounded-lg bg-sage-100 px-2 py-1" onClick={()=>{setDayPresets(rows=>[...rows.filter(x=>!copyTo.includes(x.key)),...copyTo.flatMap(key=>rows.filter(x=>x.key===copyFrom).map(x=>({...x,id:crypto.randomUUID(),key,replaces:""})))]);setCopyTo([]);setShowCopyConfirm(false);}}>{zh?"确认复制":"Confirm copy"}</button></div></div>}
        </div>}
        <p className="text-xs text-ink-faint">{zh?"每个日期支持多个时段，未来重复安排不会批量生成预约。":"Each day can have multiple slots; future bookings are expanded virtually."}</p>
      </div>}
      {scope!=="once"&&<p className="text-xs text-ink-faint">生效日期不等于执行日期。只对符合任务规则的未来日期生效，不会把不匹配的今天安排进去。</p>}
      {scope!=="once"&&<p className="text-xs text-ink-faint">预计生效日期：{preview.join("、")||"当前选择暂无符合日期"}</p>}
      {scope!=="by_day"&&<p className="text-xs font-semibold text-ink-soft">{zh?"第二步 · 时间方式":"Step 2 · Timing"}</p>}
      {scope!=="by_day"&&<div className="grid grid-cols-3 gap-1.5">{([{id:"flexible",label:zh?"灵活投入":"Flexible"},{id:"window",label:zh?"时间窗口":"Window"},{id:"fixed",label:zh?"固定时段":"Fixed"}] as const).map(x=><button type="button" key={x.id} onClick={()=>setMode(x.id)} aria-pressed={mode===x.id} className={`rounded-lg border px-1 py-2 text-xs ${mode===x.id?"border-sage-400 bg-sage-50 text-sage-700":"border-line text-ink-soft"}`}>{x.label}</button>)}</div>}
      {(scope!=="once"||mode!=="fixed")&&<label className="block text-xs text-ink-soft">{scope==="once"?"执行日期":"规则生效起始日期"}<AppDatePicker value={date} onChange={setDate}/></label>}
      {scope!=="by_day"&&mode!=="fixed"&&<label className="block text-xs text-ink-soft">计划投入（分钟）<input className={field+" mt-1"} type="number" min="1" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>}
      {scope!=="by_day"&&mode==="window"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-ink-soft">最早开始<input className={field+" mt-1"} type="time" value={windowStart} onChange={e=>setWindowStart(e.target.value)}/></label><label className="text-xs text-ink-soft">最晚结束<input className={field+" mt-1"} type="time" value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label></div>}
      {scope!=="by_day"&&mode==="fixed"&&<div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scope==="once"&&<label className="block text-xs text-ink-soft">{zh?"开始日期":"Start date"}<AppDatePicker value={fixedStartDate} onChange={setFixedStartDate}/></label>}
          <label className="block text-xs text-ink-soft">开始时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:00" value={fixedStartTime} onChange={e=>setFixedStartTime(e.target.value)}/></label>
          {scope==="once"&&<label className="block text-xs text-ink-soft">{zh?"结束日期":"End date"}<AppDatePicker value={fixedEndDate} onChange={setFixedEndDate}/></label>}
          <label className="block text-xs text-ink-soft">结束时间（24小时制）<input className={field+" mt-1"} type="text" inputMode="numeric" placeholder="20:45" value={fixedEndTime} onChange={e=>setFixedEndTime(e.target.value)}/></label>
        </div>
        <p className="text-xs text-ink-faint">{scope==="once"?"单次固定预约允许跨日期。":"重复固定预约按当地时钟时间自动应用于未来日期，当前只支持同一天内的时段。"}</p>
      </div>}
      <p className="text-xs text-ink-faint">{mode==="fixed"?"固定时段会显示在 Calendar；重复设置自动生成未来时段。":mode==="window"?"窗口不是连续预约时长，也不会显示在 Calendar。":"只记录投入计划，不占用 Calendar。"}</p>
      <div className="rounded-xl border border-line bg-paper/40 p-3 text-xs text-ink-soft">
        <p className="mb-1 font-semibold">{zh?"第三步 · 确认安排":"Step 3 · Review"}</p>
        <p>{scope==="once"?"只安排一次":scope==="all"?"以后所有符合规则的日期":"选定的星期／月日期"} · {scope==="by_day"?dayPresets.map(row=>(row.key==="month_end"?"月末":row.key.startsWith("weekday:")?"星期"+row.key.split(":")[1]:"每月"+row.key.split(":")[1]+"日")+" "+(row.mode==="fixed"?row.start+"–"+row.end:row.mode==="window"?row.windowStart+"–"+row.windowEnd:"灵活 "+row.minutes+" 分钟")).join("；")||"请先选择日期":mode==="fixed"?"固定 "+fixedStartTime+"–"+fixedEndTime:mode==="window"?"时间窗口 "+windowStart+"–"+windowEnd:"灵活安排，计划 "+minutes+" 分钟"}</p>
        {scope!=="once"&&<p className="mt-1">起始生效：{date}；下一批符合日期：{preview.join("、")||"暂无"}。未来日期不会批量插入真实预约。</p>}
      </div>
      <button type="button" disabled={saving||(scope==="by_day"&&dayPresets.length===0)} className="btn-primary w-full" onClick={()=>void save()}>{saving?(zh?"保存中…":"Saving…"):editingTemplateId?(zh?"从选定日期起更新":"Update future schedule"):(zh?"保存执行安排":"Save schedule")}</button>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-blush-500">{error}</p>}
  </section>;
}
