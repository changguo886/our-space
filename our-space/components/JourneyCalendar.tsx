"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DayStatus = "planned" | "progress" | "completed" | "rest" | "skipped";
type DayRow = { day_date: string; day_status: DayStatus; note: string };
type JourneyCalendarProps = {
  journeyId: string; startDate: string; targetDate: string;
  animal: string; route: string; initialDate?: string;
};
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const STATUS: Record<DayStatus,string> = { planned: "计划中", progress: "有进展", completed: "已完成", rest: "休息", skipped: "未推进" };
function toISO(y:number,m:number,d:number) { return [y,String(m+1).padStart(2,"0"),String(d).padStart(2,"0")].join("-"); }
function thisMonth() { const d=new Date();return { year:d.getFullYear(),month:d.getMonth() }; }
const emoji:Record<string,string>={cat:"🐱",dog:"🐶",rabbit:"🐰",fox:"🦊"};
const scenery:Record<string,string>={swim:"🌊",run:"🌿",hike:"⛰️",cycle:"🚲"};

export default function JourneyCalendar({journeyId,startDate,targetDate,animal,route,initialDate}:JourneyCalendarProps) {
  const [month,setMonth]=useState(() => { const match=initialDate?.match(/^(\d{4})-(\d{2})-\d{2}$/); return match ? {year:Number(match[1]),month:Number(match[2])-1}:thisMonth(); });
  const [selected,setSelected]=useState<string|null>(null);
  const [rows,setRows]=useState<Record<string,DayRow>>({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const [range,setRange]=useState({start:startDate,end:targetDate});
  const [draft,setDraft]=useState<{start:string;end:string}|null>(null);
  const [edge,setEdge]=useState<"start"|"end"|null>(null);
  const [rangeSaving,setRangeSaving]=useState(false);
  const [rangeMessage,setRangeMessage]=useState("");
  const drag=useRef<{edge:"start"|"end";pointerId:number}|null>(null);
  const monthEdgeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const monthEdgeDirection=useRef(0);
  function clearMonthEdge(){
    if(monthEdgeTimer.current)clearTimeout(monthEdgeTimer.current);
    monthEdgeTimer.current=null;monthEdgeDirection.current=0;
  }
  useEffect(()=>()=>{if(monthEdgeTimer.current)clearTimeout(monthEdgeTimer.current);},[]);
  function turnMonth(delta:number){
    setMonth(current=>{const d=new Date(current.year,current.month+delta,1);return {year:d.getFullYear(),month:d.getMonth()};});
  }
  useEffect(()=>{setRange({start:startDate,end:targetDate});setDraft(null);setEdge(null);},[journeyId,startDate,targetDate]);
  const display=draft??range;
  function adjust(which:"start"|"end",date:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    setDraft(prev=>{const next={...(prev??range),[which]:date};return next.start<=next.end?next:prev??range;});
    setRangeMessage("");
  }
  function begin(which:"start"|"end"){
    setEdge(which);setSelected(null);setDraft(prev=>prev??{...range});setRangeMessage("");
  }
  function cancelRange(){clearMonthEdge();setDraft(null);setEdge(null);setRangeMessage("");}
  async function confirmRange(){
    if(!draft||rangeSaving||draft.start>draft.end)return;
    if(draft.start===range.start&&draft.end===range.end){cancelRange();return;}
    setRangeSaving(true);setRangeMessage("");
    const {data,error:err}=await createClient().from("goal_journeys")
      .update({start_date:draft.start,target_date:draft.end}).eq("id",journeyId)
      .select("start_date,target_date").single();
    if(err)setRangeMessage("保存日期失败："+err.message);
    else if(data){setRange({start:data.start_date,end:data.target_date});setDraft(null);setEdge(null);setRangeMessage("日期已保存，原有 Session 未改变。");}
    setRangeSaving(false);
  }
  function dragStart(event:React.PointerEvent<HTMLButtonElement>,which:"start"|"end"){
    if(event.pointerType==="mouse"&&event.button!==0)return;
    event.stopPropagation();begin(which);
    drag.current={edge:which,pointerId:event.pointerId};
    event.currentTarget.closest("section")?.setPointerCapture(event.pointerId);
  }
  function dragMove(event:React.PointerEvent<HTMLButtonElement>){
    if(!drag.current||drag.current.pointerId!==event.pointerId)return;
    const el=document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-journey-date]");
    const date=el?.getAttribute("data-journey-date");
    if(date)adjust(drag.current.edge,date);
    const region=event.currentTarget.getBoundingClientRect();
    const direction=event.clientX<region.left+24?-1:event.clientX>region.right-24?1:0;
    if(direction!==monthEdgeDirection.current){
      clearMonthEdge();
      if(direction){
        monthEdgeDirection.current=direction;
        monthEdgeTimer.current=setTimeout(()=>{
          turnMonth(direction);
          clearMonthEdge();
        },850);
      }
    }
  }
  function dragEnd(event:React.PointerEvent<HTMLButtonElement>){
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;clearMonthEdge();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
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
  function open(date:string) {if(edge){adjust(edge,date);return;}setSelected(date);setNote(rows[date]?.note??"");}
  async function save(status:DayStatus) {
    if(!selected||saving||selected<range.start||selected>range.end)return;
    setSaving(true);setError("");
    const {data,error:saveError}=await createClient().from("goal_journey_days")
      .upsert({journey_id:journeyId,day_date:selected,day_status:status,note:note.trim()},
        {onConflict:"journey_id,day_date"}).select("day_date,day_status,note").single();
    if(saveError)setError("保存失败："+saveError.message);
    else setRows(current=>({...current,[selected]:data as DayRow}));
    setSaving(false);
  }
  const chosen=selected?rows[selected]:undefined;
  return <section onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} className="mt-3 rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold text-[#425F4B]">成长日历</h4>
        <p className="mt-1 text-xs text-ink-faint">{scenery[route]??"🌱"} 和伙伴一起，慢慢走到终点</p>
        <p className="mt-1 text-xs text-[#54735C]">旅程日期：{range.start} → {range.end}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={()=>move(-1)} aria-label="上个月" className="rounded-lg border border-line px-3 py-1.5">‹</button>
        <span className="min-w-[105px] text-center text-sm font-medium">{month.year} 年 {month.month+1} 月</span>
        <button type="button" onClick={()=>move(1)} aria-label="下个月" className="rounded-lg border border-line px-3 py-1.5">›</button>
        <button type="button" onClick={()=>{setMonth(thisMonth());setSelected(null);}} className="rounded-lg bg-sage-50 px-2 py-1.5 text-xs text-sage-700">今天</button>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper/60 px-3 py-2">
      <button type="button" onClick={()=>begin("start")} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs">调整起点</button>
      <button type="button" onClick={()=>begin("end")} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs">调整终点</button>
      <span className="text-[11px] text-ink-faint">拖动边缘手柄；拖到月历左右侧稍作停留可翻月。也可点击日期或使用日期输入框。</span>
    </div>
    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map(d=><div key={d} className="pb-1 text-center text-[10px] text-[#87958B]">{d}</div>)}
      {cells.map((cell,i)=>{
        if(!cell)return <div key={"empty-"+i} className="min-h-[63px] sm:min-h-[78px]"/>;
        const active=cell.date>=display.start&&cell.date<=display.end;
        const state=rows[cell.date]?.day_status;
        const current=cell.date===today;
        return <div key={cell.date} data-journey-date={cell.date} className="relative"><button type="button" onClick={()=>open(cell.date)}
          aria-label={cell.date+(state?" "+STATUS[state]:"")}
          aria-pressed={selected===cell.date}
          className={`relative flex w-full min-h-[63px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition sm:min-h-[78px] sm:p-2 ${selected===cell.date?"border-sage-500 ring-1 ring-sage-300":current?"border-sage-300":"border-[#E8EDE7]"} ${active?"bg-[#E8F2EB]":"bg-[#FAFAF8] opacity-65"}`}>
          <span className={`text-[11px] ${current?"font-bold text-sage-700":"text-[#69786C]"}`}>{cell.day}</span>
          {active&&<span aria-hidden="true" className="h-1 w-full rounded-full bg-[#D4E5DE]"/>}
          {active && <span className="text-sm leading-none">{state==="rest"?"💤":state==="completed"?"✨":state==="progress"?"💧":state==="skipped"?"☁️":current?emoji[animal]??"🐱":"·"}</span>}
          {active && state && <span className="text-[9px] leading-tight text-[#637C6C]">{STATUS[state]}</span>}
        </button>
        {(cell.date===display.start||cell.date===display.end)&&<button type="button"
          aria-label={cell.date===display.start?"拖动旅程开始日期":"拖动旅程结束日期"}
          onPointerDown={e=>dragStart(e,cell.date===display.start?"start":"end")}
          onClick={e=>e.stopPropagation()} style={{touchAction:"none"}}
          className="absolute bottom-1 right-1 flex h-7 w-7 cursor-ew-resize items-center justify-center rounded-md border border-sage-400 bg-white text-sage-700 shadow-sm">⋮</button>}
        </div>;
      })}
    </div>
    {draft&&<div className="mt-3 space-y-3 rounded-xl border border-sage-200 bg-sage-50 p-3">
      <p className="text-sm font-medium text-sage-700">调整日期（草稿，尚未保存）</p>
      <p className="text-xs text-ink-soft">原范围：{range.start} → {range.end}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs">新的开始日期<input type="date" className="input mt-1 w-full" value={draft.start} max={draft.end} onChange={e=>adjust("start",e.target.value)}/></label>
        <label className="text-xs">新的结束日期<input type="date" className="input mt-1 w-full" value={draft.end} min={draft.start} onChange={e=>adjust("end",e.target.value)}/></label>
      </div>
      <p className="text-xs text-ink-faint">仅修改旅程范围，不会移动已安排的 Session，也不会更改 Todo 截止日期。</p>
      <div className="flex gap-2">
        <button type="button" disabled={rangeSaving} onClick={()=>void confirmRange()} className="rounded-lg bg-sage-600 px-4 py-2 text-xs text-white disabled:opacity-50">{rangeSaving?"保存中…":"确认保存"}</button>
        <button type="button" disabled={rangeSaving} onClick={cancelRange} className="rounded-lg border border-line bg-white px-4 py-2 text-xs">取消</button>
      </div>
    </div>}
    {rangeMessage&&<p role="status" className="mt-2 text-xs text-ink-soft">{rangeMessage}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[10px] text-ink-faint">
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
