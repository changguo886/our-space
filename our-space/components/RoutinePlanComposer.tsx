"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {addDaysISO,lastDayISO,weekdayISO,type HabitPatternV3} from "@/lib/recurring-execution";
type Mode="fixed"|"window"|"flexible";
type Slot={id:string;key:string;mode:Mode;start:string;end:string;minutes:string};
type Props={todoId:string;pattern:HabitPatternV3;today:string;startDate:string;onSaved:()=>Promise<void>;zh:boolean};
const defaults=():Omit<Slot,"id"|"key">=>({mode:"fixed",start:"09:00",end:"10:00",minutes:"45"});
const pad=(n:number)=>String(n).padStart(2,"0");
const dayAt=(year:number,month:number,day:number)=>year+"-"+pad(month)+"-"+pad(day);
const validTime=(x:string)=>/^([01]\\d|2[0-3]):[0-5]\\d$/.test(x);
const toDate=(d:string,t:string)=>new Date(d+"T"+t+":00").toISOString();
function nextCycle(day:string,period:"day"|"week"|"month"){
 if(period==="week")return addDaysISO(day,7);
 if(period==="day")return addDaysISO(day,1);
 const [y,m]=day.split("-").map(Number);
 return dayAt(m===12?y+1:y,m===12?1:m+1,1);
}
export default function RoutinePlanComposer({todoId,pattern,today,startDate,onSaved,zh}:Props){
 const [anchor,setAnchor]=useState(today);
 const [selected,setSelected]=useState<number[]>([]);
 const [slots,setSlots]=useState<Slot[]>([]);
 const [shared,setShared]=useState(defaults());
 const [scope,setScope]=useState<"period"|"ongoing">("ongoing");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const weekly=pattern.period!=="month";
 const fixed=pattern.arrangement==="fixed";
 const [year,month]=anchor.split("-").map(Number);
 const weekdayStart=addDaysISO(anchor,1-weekdayISO(anchor));
 const periodStart=weekly?weekdayStart:dayAt(year,month,1);
 const periodEnd=weekly?addDaysISO(weekdayStart,6):dayAt(year,month,lastDayISO(anchor));
 const values=weekly?[1,2,3,4,5,6,7]:Array.from({length:lastDayISO(anchor)},(_,i)=>i+1);
 const dayFor=(v:number)=>weekly?addDaysISO(weekdayStart,v-1):dayAt(year,month,v);
 const eligible=(v:number)=>{const d=dayFor(v);return d>=today&&d>=startDate;};
 const defaultKeys=()=>pattern.period==="week"?pattern.weekdays:pattern.period==="month"?[...pattern.month_days,...(pattern.include_month_end?[lastDayISO(anchor)]:[])]:[];
 useEffect(()=>{
   const ids=[...new Set(defaultKeys())].filter(eligible);
   setSelected(fixed?ids:[]);
   setSlots([]);setError("");setNotice("");
 },[todoId,anchor,pattern.arrangement,pattern.period,pattern.weekdays.join(","),pattern.month_days.join(","),pattern.include_month_end]);
 const chosen=selected.filter(eligible);
 const addSelection=(ids:number[])=>setSelected([...new Set(ids.filter(eligible))].sort((a,b)=>a-b));
 const apply=()=>{
   if(!chosen.length){setError(zh?"请先选择日期。":"Select dates first.");return;}
   const added=chosen.map(day=>({id:crypto.randomUUID(),key:String(day),...shared}));
   setSlots(previous=>{
     const kept=previous.filter(s=>!chosen.includes(Number(s.key)));
     return [...kept,...added].sort((a,b)=>Number(a.key)-Number(b.key));
   });
   setNotice(zh?"已应用统一配置，可以逐日调整。":"Applied. You can edit each day.");
 };
 const update=(id:string,changes:Partial<Slot>)=>setSlots(rows=>rows.map(r=>r.id===id?{...r,...changes}:r));
 const save=async()=>{
   setError("");setNotice("");
   if(!slots.length){setError(zh?"请先应用至少一个执行时段。":"Apply at least one time slot.");return;}
   for(const slot of slots){
     if(!eligible(Number(slot.key))){setError(zh?"包含过去或任务开始前的日期。":"A selected date is unavailable.");return;}
     if(slot.mode!=="flexible"&&(!validTime(slot.start)||!validTime(slot.end)||slot.end<=slot.start)){setError(zh?"开始结束时间无效，暂不支持跨日预约。":"Invalid or overnight time range.");return;}
     const mins=Number(slot.minutes);
     if(slot.mode!=="fixed"&&(!Number.isInteger(mins)||mins<1||mins>1440)){setError(zh?"预计投入必须为 1–1440 分钟。":"Minutes must be between 1 and 1440.");return;}
     if(slot.mode==="window"&&mins>(Number(slot.end.slice(0,2))*60+Number(slot.end.slice(3))-Number(slot.start.slice(0,2))*60-Number(slot.start.slice(3)))){setError(zh?"预计投入不能超过窗口长度。":"Estimated time exceeds window.");return;}
   }
   if(scope==="ongoing"&&pattern.period==="month"&&slots.some(s=>Number(s.key)>28)){
     const confirmation=window.confirm(zh?"29–31 日并非每个月都存在，缺少这些日期的月份会跳过。继续？":"Dates 29–31 are skipped in shorter months. Continue?");
     if(!confirmation)return;
   }
   setBusy(true);const db=createClient();let failure="";
   if(scope==="ongoing"){
     const startsOn=nextCycle(addDaysISO(periodStart,-1),pattern.period); // First day of selected period
     const rows=slots.map(s=>({
       todo_id:todoId,starts_on:startsOn,ends_on:null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",
       selector_kind:weekly?"weekday":"month_day",selector_value:Number(s.key),
       execution_mode:s.mode,replaces_slot_key:null,
       start_time:s.mode==="fixed"?s.start:null,end_time:s.mode==="fixed"?s.end:null,
       window_start:s.mode==="window"?s.start:null,window_end:s.mode==="window"?s.end:null,
       planned_minutes:s.mode==="fixed"?null:Number(s.minutes)
     }));
     const existing=await db.from("todo_execution_templates").select("id,selector_kind,selector_value,starts_on,ends_on").eq("todo_id",todoId);
     if(existing.error)failure=existing.error.message;
     else if(rows.some(row=>(existing.data??[]).some(t=>t.selector_kind===row.selector_kind&&t.selector_value===row.selector_value&&(t.ends_on===null||t.ends_on>=row.starts_on))))failure=zh?"已有同一星期／月日的长期安排，请先修改已有规则。":"Existing recurring slot conflicts with your selection.";
     else {const result=await db.from("todo_execution_templates").insert(rows);failure=result.error?.message??"";}
   }else{
     const rows=slots.map(s=>{
       const day=dayFor(Number(s.key));
       return s.mode==="fixed"
       ?{todo_id:todoId,mode:"fixed",scheduled_start:toDate(day,s.start),scheduled_end:toDate(day,s.end)}
       :{todo_id:todoId,mode:s.mode,plan_date:day,planned_minutes:Number(s.minutes),window_start:s.mode==="window"?s.start:null,window_end:s.mode==="window"?s.end:null};
     });
     const result=await db.from("todo_sessions").insert(rows);failure=result.error?.message??"";
   }
   setBusy(false);
   if(failure){setError(failure);return;}
   setSlots([]);setNotice(zh?"执行计划已保存。":"Execution plan saved.");await onSaved();
 };
 const input="w-full rounded-lg border border-line bg-white px-2 py-2 text-sm";
 return <div className="space-y-4 rounded-xl border border-sage-200 bg-sage-50/30 p-4">
   <div><h4 className="font-semibold text-ink">{zh?"制定执行计划":"Plan execution"}</h4><p className="text-xs text-ink-faint">{zh?"先选择日期、统一设置时间，再逐日微调并一次保存。完成目标不会被自动修改。":"Choose dates, apply timing, then adjust and save. Completion goals remain separate."}</p></div>
   <div className="flex items-center justify-between gap-2"><button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={()=>setAnchor(dayAt(year,month,1).slice(0,7)+"-01"===anchor?addDaysISO(periodStart,weekly?-7:-1):weekly?addDaysISO(anchor,-7):dayAt(month===1?year-1:year,month===1?12:month-1,1))}>‹</button><strong className="text-sm">{weekly?periodStart+" – "+periodEnd:year+"-"+pad(month)}</strong><button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={()=>setAnchor(weekly?addDaysISO(anchor,7):nextCycle(anchor,"month"))}>›</button></div>
   {weekly&&<div className="flex flex-wrap gap-2"><button type="button" onClick={()=>addSelection([1,2,3,4,5])} className="rounded-lg border px-3 py-1.5 text-xs">{zh?"工作日":"Weekdays"}</button><button type="button" onClick={()=>addSelection([6,7])} className="rounded-lg border px-3 py-1.5 text-xs">{zh?"周末":"Weekend"}</button><button type="button" onClick={()=>addSelection([])} className="rounded-lg border px-3 py-1.5 text-xs">{zh?"清空":"Clear"}</button></div>}
   <div className={weekly?"grid grid-cols-7 gap-1":"grid grid-cols-7 gap-1"}>
     {values.map(v=><button key={v} type="button" disabled={!eligible(v)} onClick={()=>addSelection(selected.includes(v)?selected.filter(x=>x!==v):[...selected,v])} className={`min-h-9 rounded-lg border text-xs disabled:opacity-30 ${selected.includes(v)?"border-sage-500 bg-sage-100 text-sage-700":"border-line bg-white"}`} title={dayFor(v)}>{weekly?["一","二","三","四","五","六","日"][v-1]:v}{fixed&&defaultKeys().includes(v)?" •":""}</button>)}
   </div>
   <p className="text-xs text-ink-faint">{zh?"圆点代表规则日；其他日期也可以手动安排。弹性次数无需填满目标次数。":"Dots indicate rule days; other dates are optional. Flexible goals do not require booking every occurrence."}</p>
   <div className="space-y-2"><strong className="text-sm">{zh?"统一时间配置":"Shared timing"}</strong><div className="flex flex-wrap gap-2">{(["fixed","window","flexible"] as Mode[]).map(m=><button key={m} type="button" onClick={()=>setShared(s=>({...s,mode:m}))} className={`rounded-lg border px-3 py-2 text-xs ${shared.mode===m?"border-sage-500 bg-sage-100":"border-line"}`}>{m==="fixed"?(zh?"固定":"Fixed"):m==="window"?(zh?"时间窗口":"Window"):(zh?"灵活投入":"Flexible")}</button>)}</div>
     {shared.mode!=="flexible"&&<div className="grid grid-cols-2 gap-2"><label className="text-xs">{zh?"开始":"Start"}<input type="time" className={input} value={shared.start} onChange={e=>setShared(s=>({...s,start:e.target.value}))}/></label><label className="text-xs">{zh?"结束":"End"}<input type="time" className={input} value={shared.end} onChange={e=>setShared(s=>({...s,end:e.target.value}))}/></label></div>}
     {shared.mode!=="fixed"&&<label className="block text-xs">{zh?"预计分钟":"Minutes"}<input type="number" min="1" max="1440" className={input} value={shared.minutes} onChange={e=>setShared(s=>({...s,minutes:e.target.value}))}/></label>}
     <button type="button" onClick={apply} disabled={!chosen.length} className="w-full rounded-lg border border-sage-400 bg-white p-2 text-sm text-sage-700">{zh?`应用到选中的 ${chosen.length} 天`:`Apply to ${chosen.length} days`}</button>
   </div>
   {slots.length>0&&<div className="space-y-2"><strong className="text-sm">{zh?"逐日微调":"Per-day adjustments"}</strong>{slots.map(s=><div key={s.id} className="rounded-lg border border-line bg-white p-3 space-y-2">
     <div className="flex justify-between items-center"><strong className="text-xs">{dayFor(Number(s.key))}</strong><button type="button" className="text-xs text-blush-500" onClick={()=>setSlots(xs=>xs.filter(x=>x.id!==s.id))}>{zh?"移除":"Remove"}</button></div>
     <div className="flex gap-2">{(["fixed","window","flexible"] as Mode[]).map(m=><button key={m} type="button" onClick={()=>update(s.id,{mode:m})} className={`rounded border px-2 py-1 text-xs ${s.mode===m?"bg-sage-50 border-sage-400":"border-line"}`}>{m==="fixed"?"Fixed":m==="window"?"Window":"Flexible"}</button>)}</div>
     {s.mode!=="flexible"&&<div className="grid grid-cols-2 gap-2"><input type="time" aria-label="Start" className={input} value={s.start} onChange={e=>update(s.id,{start:e.target.value})}/><input type="time" aria-label="End" className={input} value={s.end} onChange={e=>update(s.id,{end:e.target.value})}/></div>}
     {s.mode!=="fixed"&&<input type="number" aria-label="Planned minutes" className={input} value={s.minutes} onChange={e=>update(s.id,{minutes:e.target.value})}/>}
   </div>)}</div>}
   <fieldset className="space-y-2"><legend className="text-sm font-semibold">{zh?"重复范围":"Repeat range"}</legend><label className="flex gap-2 items-center text-sm"><input type="radio" checked={scope==="period"} onChange={()=>setScope("period")}/>{zh?"仅本周期":"This period only"}</label><label className="flex gap-2 items-center text-sm"><input type="radio" checked={scope==="ongoing"} onChange={()=>setScope("ongoing")}/>{zh?"以后持续按这些时间安排":"Repeat indefinitely"}</label></fieldset>
   <button type="button" disabled={busy||!slots.length} className="btn-primary w-full" onClick={()=>void save()}>{busy?(zh?"保存中…":"Saving…"):(zh?"保存执行计划":"Save execution plan")}</button>
   {error&&<p role="alert" className="text-xs text-blush-500">{error}</p>}{notice&&<p role="status" className="text-xs text-sage-700">{notice}</p>}
 </div>;
}
