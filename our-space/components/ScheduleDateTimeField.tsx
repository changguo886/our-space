"use client";

import { CalendarDays, Clock3 } from "lucide-react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label: string;
  chinese?: boolean;
  min?: string;
};

function prettyDate(date: string, chinese: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return chinese ? "选择日期" : "Choose date";
  const [y,m,d] = date.split("-").map(Number);
  const day = new Date(y,m-1,d);
  const weekday = chinese ? ["日","一","二","三","四","五","六"][day.getDay()] : day.toLocaleDateString("en-US",{weekday:"short"});
  return chinese ? `${y}年${m}月${d}日 周${weekday}` : day.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+` ${weekday}`;
}

export default function ScheduleDateTimeField({value,onChange,disabled,label,chinese=true,min}:Props) {
  const [date="",time=""] = value.split("T");
  const update=(nextDate:string,nextTime:string)=>onChange(nextDate ? nextDate+"T"+(nextTime||"09:00") : "");
  return <div className="min-w-0">
    <p className="mb-2 text-xs font-medium text-ink-soft">{label}</p>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_112px] gap-2">
      <label className="relative flex min-h-[52px] min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-xl border border-line bg-white px-3 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100">
        <CalendarDays size={16} className="shrink-0 text-sage-700"/>
        <span className="truncate text-xs font-medium text-ink">{prettyDate(date,chinese)}</span>
        <input type="date" value={date} min={min?.split("T")[0]} disabled={disabled}
          onChange={e=>update(e.target.value,time)} aria-label={label+(chinese?"日期":" date")}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
      </label>
      <label className="flex min-h-[52px] min-w-0 items-center gap-1 rounded-xl border border-line bg-white px-2 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100">
        <Clock3 size={15} className="shrink-0 text-sage-700"/>
        <input type="time" step={300} value={time} disabled={disabled}
          onChange={e=>update(date,e.target.value)} aria-label={label+(chinese?"时刻":" time")}
          className="min-w-0 w-full bg-transparent text-xs font-medium text-ink outline-none"/>
      </label>
    </div>
  </div>;
}
