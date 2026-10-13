"use client";
import {useState} from "react";
import {weekdayISO} from "@/lib/recurring-execution";
type Props={
 start:string;end:string;selected:string[];
 /** Days that already hold some plan: shown with a dot but still selectable. */
 booked:string[];
 /** Days where copying would duplicate or overlap an existing plan: not selectable. */
 blocked?:string[];
 eligible:(day:string)=>boolean;onToggle:(day:string)=>void;zh:boolean;deadline?:string;today?:string;
 /** True when the flexible-quota limit is reached; unselected days are disabled. */
 limitReached?:boolean;
};
export default function CopyDateCalendar({start,end,selected,booked,blocked=[],eligible,onToggle,zh,deadline,today,limitReached=false}:Props){
 const [month,setMonth]=useState(start.slice(0,7));
 const [y,m]=month.split("-").map(Number);
 const first=weekdayISO(month+"-01")-1;
 const length=new Date(Date.UTC(y,m,0)).getUTCDate();
 const cells=[...Array(first).fill(null),...Array.from({length},(_,i)=>month+"-"+String(i+1).padStart(2,"0"))] as (string|null)[];
 const prev=()=>{const d=new Date(Date.UTC(y,m-2,1));setMonth(d.toISOString().slice(0,7))};
 const next=()=>{const d=new Date(Date.UTC(y,m,1));setMonth(d.toISOString().slice(0,7))};
 const reserved=new Set(booked),taken=new Set(blocked),chosen=new Set(selected);
 const cutoff=today??new Date().toLocaleDateString("en-CA");
 return <div className="rounded-xl border border-line bg-white p-3">
   <div className="mb-3 flex items-center justify-between">
     <button type="button" aria-label={zh?"上个月":"Previous month"} onClick={prev} className="rounded-lg border border-line px-3 py-1">‹</button>
     <strong className="text-sm">{zh?`${y} 年 ${m} 月`:`${y}-${String(m).padStart(2,"0")}`}</strong>
     <button type="button" aria-label={zh?"下个月":"Next month"} onClick={next} className="rounded-lg border border-line px-3 py-1">›</button>
   </div>
   <div className="grid grid-cols-7 gap-1 text-center">
     {(zh?["一","二","三","四","五","六","日"]:["M","T","W","T","F","S","S"]).map((w,i)=><span key={i} className="py-1 text-[11px] text-ink-soft">{w}</span>)}
     {cells.map((day,i)=>{
       if(!day)return <span key={"blank"+i}/>;
       const isSource=day===start;
       const inRange=day>start&&day<=end&&day>=cutoff,active=chosen.has(day),conflict=taken.has(day),hasPlan=reserved.has(day);
       const allowed=inRange&&eligible(day)&&!conflict&&(active||!limitReached);
       const title=isSource?(zh?"复制来源":"Source"):conflict?(zh?"这天已有相同或重叠的安排":"Already has a matching plan"):!inRange||!eligible(day)?(zh?"不可选":"Unavailable"):limitReached&&!active?(zh?"已达到本周期次数":"Period goal reached"):day;
       return <button key={day} type="button" disabled={!allowed} aria-pressed={active} title={title}
         onClick={()=>onToggle(day)}
         className={`relative min-h-10 rounded-lg border text-xs ${isSource?"border-sage-600 bg-sage-600 text-white":active?"border-2 border-dashed border-sage-500 bg-sage-50 font-semibold text-sage-700":allowed?"border-line hover:border-sage-400":"border-transparent bg-paper/50 text-ink-faint"}`}>
         {Number(day.slice(-2))}
         {deadline===day&&<span className="absolute right-0.5 top-0 text-[9px] font-semibold text-blush-500">{zh?"截止":"DDL"}</span>}
         {hasPlan&&!isSource&&<span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sage-600"/>}
       </button>;
     })}
   </div>
   <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-soft">
      <span>● {zh?"已有安排":"Has a plan"}</span><span>▧ {zh?"将复制":"Will copy"}</span>
   </div>
 </div>;
}
