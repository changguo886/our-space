"use client";
import {useEffect,useRef,useState} from "react";
import {Clock3} from "lucide-react";
import {useI18n} from "@/components/I18nProvider";
export function normalizeClock(raw:string):string|null {
  const s=raw.trim();
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return s;
  if(/^\d{1,2}$/.test(s)){const h=Number(s);return h<24?String(h).padStart(2,"0")+":00":null;}
  if(/^\d{3,4}$/.test(s)){const n=s.padStart(4,"0"),h=Number(n.slice(0,2)),m=Number(n.slice(2));return h<24&&m<60?n.slice(0,2)+":"+n.slice(2):null;}
  const match=s.match(/^(\d{1,2}):(\d{1,2})$/);
  if(match){const h=Number(match[1]),m=Number(match[2]);return h<24&&m<60?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"):null;}
  return null;
}
export default function AppTimePicker({value,onChange,disabled=false}:{value:string;onChange:(s:string)=>void;disabled?:boolean}){
 const {language}=useI18n(),zh=language==="zh-CN";
 const [draft,setDraft]=useState(value),[open,setOpen]=useState(false);
 const wrapper=useRef<HTMLDivElement>(null);
 useEffect(()=>setDraft(value),[value]);
 useEffect(()=>{if(!open)return;const handle=(e:PointerEvent)=>{if(!wrapper.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("pointerdown",handle);return()=>document.removeEventListener("pointerdown",handle)},[open]);
 const choose=(s:string)=>{setDraft(s);onChange(s);setOpen(false)};
 const items=Array.from({length:96},(_,i)=>String(Math.floor(i/4)).padStart(2,"0")+":"+String(i%4*15).padStart(2,"0"));
 return <div ref={wrapper} className="relative flex w-full items-center rounded-lg border border-line bg-white">
   <input type="text" inputMode="numeric" value={draft} maxLength={5} placeholder="HH:mm" disabled={disabled}
     aria-label={zh?"24小时时间":"24-hour time"} aria-invalid={draft.length>0&&!normalizeClock(draft)}
     onChange={e=>setDraft(e.target.value)}
     onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const n=normalizeClock(draft);if(n)choose(n)}else if(e.key==="Escape")setOpen(false)}}
     onBlur={()=>{const n=normalizeClock(draft);if(n){setDraft(n);onChange(n)}}}
     className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-ink outline-none"/>
   <button type="button" aria-label={zh?"选择时间":"Choose time"} aria-expanded={open} disabled={disabled}
     onClick={()=>setOpen(v=>!v)} className="shrink-0 rounded-lg p-2 text-ink-soft hover:bg-paper"><Clock3 className="h-4 w-4"/></button>
   {open&&<div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-[160px] overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-lg" role="listbox" aria-label={zh?"选择时间":"Select time"}>
     {items.map(s=><button key={s} type="button" role="option" aria-selected={s===value} onClick={()=>choose(s)}
       className={`block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sage-50 ${s===value?"bg-sage-50 font-semibold":""}`}>{s}</button>)}
   </div>}
 </div>;
}
