"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DayStatus = "planned" | "progress" | "completed" | "rest" | "skipped";
type DayRow = { day_date: string; day_status: DayStatus; note: string };
type JourneyCalendarProps = {
  journeyId: string; startDate: string; targetDate: string;
  animal: string; route: string;
};
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const STATUS: Record<DayStatus,string> = { planned: "计划中", progress: "有进展", completed: "已完成", rest: "休息", skipped: "未推进" };
function toISO(y:number,m:number,d:number) { return [y,String(m+1).padStart(2,"0"),String(d).padStart(2,"0")].join("-"); }
function thisMonth() { const d=new Date();return { year:d.getFullYear(),month:d.getMonth() }; }
const emoji:Record<string,string>={cat:"🐱",dog:"🐶",rabbit:"🐰",fox:"🦊"};
const scenery:Record<string,string>={swim:"🌊",run:"🌿",hike:"⛰️",cycle:"🚲"};

export default function JourneyCalendar({journeyId,startDate,targetDate,animal,route}:JourneyCalendarProps) {
  const [month,setMonth]=useState(thisMonth);
  const [selected,setSelected]=useState<string|null>(null);
  const [rows,setRows]=useState<Record<string,DayRow>>({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const firstOfMonth=toISO(month.year,month.month,1);
  const lastOfMonth=toISO(month.year,month.month,new Date(month.year,month.month+1,0).getDate());
  const today=(()=>{const d=new Date();return toISO(d.getFullYear(),d.getMonth(),d.getDate());})();
  useEffect(()=>{
    let alive=true;setLoading(true);setError("");
    void createClient().from("goal_journey_days").select("day_date,day_status,note")
      .eq("journey_id",journeyId).gte("day_date",firstOfMonth).lte("day_date",lastOfMonth)
      .then(({data,error:loadError})=>{
        if(!alive)return;
        if(loadError)setError("每日记录尚不可用，请先执行 Journey Calendar 的数据库迁移。"+loadError.message);
        else setRows(Object.fromEntries((data??[]).map(r=>[r.day_date,r as DayRow])));
        setLoading(false);
      });
    return ()=>{alive=false;};
  },[journeyId,firstOfMonth,lastOfMonth]);
  const count=new Date(month.year,month.month+1,0).getDate();
  const offset=(new Date(month.year,month.month,1).getDay()+6)%7;
  const cells=useMemo(()=>Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{
    const day=index-offset+1;
    return day>=1&&day<=count?{day,date:toISO(month.year,month.month,day)}:null;
  }),[count,offset,month.year,month.month]);
  function move(delta:number) {
    const d=new Date(month.year,month.month+delta,1);
    setMonth({year:d.getFullYear(),month:d.getMonth()});setSelected(null);
  }
  function open(date:string) {setSelected(date);setNote(rows[date]?.note??"");}
  async function save(status:DayStatus) {
    if(!selected||saving||selected<startDate||selected>targetDate)return;
    setSaving(true);setError("");
    const {data,error:saveError}=await createClient().from("goal_journey_days")
      .upsert({journey_id:journeyId,day_date:selected,day_status:status,note:note.trim()},
        {onConflict:"journey_id,day_date"}).select("day_date,day_status,note").single();
    if(saveError)setError("保存失败："+saveError.message);
    else setRows(current=>({...current,[selected]:data as DayRow}));
    setSaving(false);
  }
  const chosen=selected?rows[selected]:undefined;
  return <section className="mt-4 rounded-2xl border border-[#E6EBE4] bg-[#FFFDF9] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold text-[#425F4B]">旅程月历</h4>
        <p className="text-xs text-[#8B958A]">每一天是一段小小的路 · {scenery[route]??"🌱"}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={()=>move(-1)} aria-label="上个月" className="rounded-lg border border-line px-3 py-1.5">‹</button>
        <span className="min-w-[105px] text-center text-sm font-medium">{month.year} 年 {month.month+1} 月</span>
        <button type="button" onClick={()=>move(1)} aria-label="下个月" className="rounded-lg border border-line px-3 py-1.5">›</button>
        <button type="button" onClick={()=>{setMonth(thisMonth());setSelected(null);}} className="rounded-lg bg-sage-50 px-2 py-1.5 text-xs text-sage-700">今天</button>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-7 gap-1">
      {WEEKDAYS.map(d=><div key={d} className="pb-1 text-center text-[10px] text-[#87958B]">{d}</div>)}
      {cells.map((cell,i)=>{
        if(!cell)return <div key={"empty-"+i} className="min-h-[63px] sm:min-h-[78px]"/>;
        const active=cell.date>=startDate&&cell.date<=targetDate;
        const state=rows[cell.date]?.day_status;
        const current=cell.date===today;
        return <button type="button" key={cell.date} onClick={()=>open(cell.date)}
          aria-label={cell.date+(state?" "+STATUS[state]:"")}
          aria-pressed={selected===cell.date}
          className={`relative flex min-h-[63px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition sm:min-h-[78px] sm:p-2 ${selected===cell.date?"border-sage-500 ring-1 ring-sage-300":current?"border-sage-300":"border-[#E8EDE7]"} ${active?"bg-[#EFF7F2]":"bg-[#FCFBF8] opacity-60"}`}>
          <span className={`text-[11px] ${current?"font-bold text-sage-700":"text-[#69786C]"}`}>{cell.day}</span>
          {active&&<span aria-hidden="true" className="h-1 w-full rounded-full bg-[#D4E5DE]"/>}
          {active && <span className="text-sm leading-none">{state==="rest"?"💤":state==="completed"?"✨":state==="progress"?"💧":state==="skipped"?"☁️":current?emoji[animal]??"🐱":"·"}</span>}
          {active && state && <span className="text-[9px] leading-tight text-[#637C6C]">{STATUS[state]}</span>}
        </button>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[#78877B]">
      <span>🌱 计划中</span><span>💧 有进展</span><span>✨ 已完成</span><span>💤 休息</span><span>🐾 今天的伙伴</span>
    </div>
    {selected && <div className="mt-3 rounded-xl border border-[#E5E9E2] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{selected} · {chosen?STATUS[chosen.day_status]:"未记录"}</div>
        <button type="button" aria-label="关闭日期详情" onClick={()=>setSelected(null)} className="text-xs text-[#7D8980]">关闭 ×</button>
      </div>
      {selected<startDate||selected>targetDate?
        <p className="mt-2 text-xs text-ink-faint">该日期不在当前旅程范围内。</p>:
        <div className="mt-3 space-y-3">
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="记录今天发生了什么（可选）"
            className="input min-h-[64px] w-full resize-y text-xs" maxLength={500}/>
          <div className="flex flex-wrap gap-2">
            {(["progress","completed","rest","skipped","planned"] as DayStatus[]).map(s=>
              <button type="button" disabled={saving||loading} key={s} onClick={()=>void save(s)}
                className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${chosen?.day_status===s?"border-sage-500 bg-sage-50 text-sage-700":"border-line bg-white text-ink-soft"}`}>
                {STATUS[s]}
              </button>)}
          </div>
          <p className="text-[11px] text-ink-faint">标记休息只记录当天状态，不会自动移动日历 Session 或更改结束日期。延期功能将另行提供影响预览。</p>
        </div>}
    </div>}
    {error&&<p role="alert" className="mt-3 text-xs text-blush-500">{error}</p>}
    {loading&&<p className="mt-2 text-xs text-ink-faint">正在读取月历记录…</p>}
  </section>;
}
