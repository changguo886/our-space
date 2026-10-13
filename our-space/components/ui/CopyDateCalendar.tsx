"use client";
import {useState} from "react";
import {addDaysISO,weekdayISO} from "@/lib/recurring-execution";
type Props={start:string;end:string;selected:string[];booked:string[];eligible:(day:string)=>boolean;onToggle:(day:string)=>void;zh:boolean};
export default function CopyDateCalendar({start,end,selected,booked,eligible,onToggle,zh}:Props){
 const [month,setMonth]=useState(start.slice(0,7));
 const [y,m]=month.split("-").map(Number);
 const first=weekdayISO(month+"-01")-1;
 const length=new Date(Date.UTC(y,m,0)).getUTCDate();
 const cells=[...Array(first).fill(null),...Array.from({length},(_,i)=>month+"-"+String(i+1).padStart(2,"0"))] as (string|null)[];
 const prev=()=>{const d=new Date(Date.UTC(y,m-2,1));setMonth(d.toISOString().slice(0,7))};
 const next=()=>{const d=new Date(Date.UTC(y,m,1));setMonth(d.toISOString().slice(0,7))};
 const reserved=new Set(booked),chosen=new Set(selected);
 return <div className="rounded-xl border border-line bg-white p-3">
   <div className="mb-3 flex items-center justify-between">
     <button type="button" aria-label={zh?"上个月":"Previous month"} onClick={prev} className="rounded-lg border px-3 py-1">‹</button>
     <strong className="text-sm">{zh?`${y} 年 ${m} 月`:`${y}-${String(m).padStart(2,"0")}`}</strong>
     <button type="button" aria-label={zh?"下个月":"Next month"} onClick={next} className="rounded-lg border px-3 py-1">›</button>
   </div>
   <div className="grid grid-cols-7 gap-1 text-center">
     {(zh?["一","二","三","四","五","六","日"]:["M","T","W","T","F","S","S"]).map((w,i)=><span key={i} className="py-1 text-[11px] text-ink-faint">{w}</span>)}
     {cells.map((day,i)=>{
       if(!day)return <span key={"blank"+i}/>;
       const inRange=day>start&&day<=end,allowed=inRange&&eligible(day),existing=reserved.has(day),active=chosen.has(day);
       return <button key={day} type="button" disabled={!allowed||existing} aria-pressed={active}
         title={existing?(zh?"已有单次安排":"Already planned"):!allowed?(zh?"超出可选范围":"Not eligible"):day}
         onClick={()=>onToggle(day)}
         className={`relative min-h-10 rounded-lg border text-xs ${active?"border-dashed border-2 border-sage-500 bg-sage-50 text-sage-700":existing?"border-sage-200 bg-sage-100 text-sage-700":allowed?"border-line hover:border-sage-400":"border-transparent bg-paper/50 text-ink-faint/50"}`}>
         {Number(day.slice(-2))}{existing&&<span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sage-600"/>}
       </button>;
     })}
   </div>
   <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-faint">
      <span>● {zh?"已有安排":"Existing"}</span><span>▧ {zh?"准备复制":"Selected"}</span><span>{zh?"灰色：不可选":"Grey: unavailable"}</span>
   </div>
 </div>;
}
