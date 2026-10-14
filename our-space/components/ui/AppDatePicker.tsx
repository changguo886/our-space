"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  id?: string;
};

function validISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function parseInput(value: string, zh: boolean): string | null {
  const v = value.trim();
  const localized = zh ? v.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?$/) : null;
  const common = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const english = !zh ? v.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/) : null;
  let y: number, m: number, d: number;
  if (localized || common) {
    const parts = localized ?? common!;
    y = Number(parts[1]); m = Number(parts[2]); d = Number(parts[3]);
  } else if (english) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    m = months.indexOf(english[1].slice(0,3).toLowerCase()) + 1;
    d = Number(english[2]); y = Number(english[3]);
  } else return null;
  const iso = [String(y).padStart(4,"0"),String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
  return validISO(iso) ? iso : null;
}
function displayDate(value: string, zh: boolean): string {
  if (!validISO(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (zh) return year + "年" + month + "月" + day + "日";
  return new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,day)));
}
function isoDate(year: number, month: number, day: number): string {
  return [String(year),String(month+1).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
}

/** Date-only input, independent of browser-native date field UI and machine timezone. */
export default function AppDatePicker({value,onChange,disabled,required,min,max,placeholder,id}: Props) {
  const {language} = useI18n();
  const zh = language === "zh-CN";
  const [draft,setDraft] = useState(() => displayDate(value,zh));
  const [open,setOpen] = useState(false);
  const [invalid,setInvalid] = useState(false);
  const [visible,setVisible] = useState(() => validISO(value)?value.slice(0,7):new Date().toISOString().slice(0,7));
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(()=>{setDraft(displayDate(value,zh));setInvalid(false);},[value,zh]);
  useEffect(()=>{
    if (!open) return;
    const dismiss = (e: PointerEvent) => {if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);};
    document.addEventListener("pointerdown",dismiss);
    return ()=>document.removeEventListener("pointerdown",dismiss);
  },[open]);
  const [year,month] = visible.split("-").map(Number);
  const first = new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const offset = (first+6)%7;
  const total = new Date(Date.UTC(year,month,0)).getUTCDate();
  const days = useMemo(()=>Array.from({length:offset+total},(_,i)=>i-offset+1),[offset,total]);
  const allowed=(iso:string)=> (!min||iso>=min)&&(!max||iso<=max);
  const commit=()=>{
    if (!draft.trim()&&!required) {onChange("");setInvalid(false);return;}
    const iso=parseInput(draft,zh);
    if (iso && allowed(iso)) {onChange(iso);setDraft(displayDate(iso,zh));setInvalid(false);}
    else setInvalid(true);
  };
  const moveMonth=(delta:number)=>{
    const d = new Date(Date.UTC(year,month-1+delta,1));
    setVisible(isoDate(d.getUTCFullYear(),d.getUTCMonth(),1).slice(0,7));
  };
  const title = new Intl.DateTimeFormat(zh?"zh-CN":"en-US",{year:"numeric",month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,1)));
  return <div ref={wrapper} className="relative">
    <div className={`flex items-center rounded-xl border bg-white focus-within:ring-2 focus-within:ring-sage-100 ${invalid?"border-blush-500":"border-line focus-within:border-sage-300"}`}>
      <input id={id} type="text" inputMode="text" disabled={disabled} required={required}
        aria-invalid={invalid} placeholder={placeholder??(zh?"年/月/日，例如 2026年10月30日":"e.g. Oct 30, 2026")}
        className="w-full min-w-0 rounded-l-xl bg-transparent px-3 py-2.5 text-sm text-ink outline-none"
        value={draft} onChange={e=>{setDraft(e.target.value);setInvalid(false);}} onBlur={commit}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();} if(e.key==="Escape")setOpen(false);}}/>
      <button type="button" disabled={disabled} aria-label={zh?"打开日历":"Open calendar"} aria-expanded={open}
        className="shrink-0 rounded-r-xl px-3 py-2.5 text-ink-soft hover:bg-paper"
        onMouseDown={e=>e.preventDefault()}
        onClick={()=>{if(validISO(value))setVisible(value.slice(0,7));setOpen(v=>!v);}}>
        <CalendarDays className="h-4 w-4"/>
      </button>
    </div>
    {invalid&&<p role="alert" className="mt-1 text-xs text-blush-500">{zh?"请输入有效日期，检查年月日及允许范围。":"Enter a valid date within the allowed range."}</p>}
    {open&&<div role="dialog" aria-label={zh?"选择日期":"Choose date"} className="absolute left-0 top-full z-50 mt-2 w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label={zh?"上个月":"Previous month"} onClick={()=>moveMonth(-1)} className="rounded-lg p-2 hover:bg-paper"><ChevronLeft className="h-4 w-4"/></button>
        <span className="text-sm font-medium text-ink">{title}</span>
        <button type="button" aria-label={zh?"下个月":"Next month"} onClick={()=>moveMonth(1)} className="rounded-lg p-2 hover:bg-paper"><ChevronRight className="h-4 w-4"/></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {(zh?["一","二","三","四","五","六","日"]:["M","T","W","T","F","S","S"]).map((name,i)=><span key={i} className="py-1 text-ink-faint">{name}</span>)}
        {days.map((day,i)=>day<1?<span key={i}/>:<button key={i} type="button" disabled={!allowed(isoDate(year,month-1,day))}
          aria-label={displayDate(isoDate(year,month-1,day),zh)}
          aria-pressed={value===isoDate(year,month-1,day)}
          className={`rounded-lg py-2 text-xs ${value===isoDate(year,month-1,day)?"bg-sage-100 font-semibold text-sage-700":"text-ink hover:bg-paper"} disabled:opacity-30`}
          onClick={()=>{onChange(isoDate(year,month-1,day));setOpen(false);}}>{day}</button>)}
      </div>
      {!required&&<button type="button" className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-soft" onClick={()=>{onChange("");setDraft("");setOpen(false);}}>{zh?"清除日期":"Clear date"}</button>}
    </div>}
  </div>;
}
