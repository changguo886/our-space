"use client";
import { useI18n } from "@/components/I18nProvider";
/** Locale-independent 24h clock input, avoids ambiguous AM/PM native controls. */
export default function AppTimePicker({value,onChange,disabled=false}:{value:string;onChange:(s:string)=>void;disabled?:boolean}) {
 const {language}=useI18n();const zh=language==="zh-CN";
 return <input type="text" inputMode="numeric" value={value} onChange={e=>onChange(e.target.value)}
   disabled={disabled} maxLength={5} placeholder="HH:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
   aria-label={zh?"24 小时时间（HH:mm）":"24-hour time (HH:mm)"}
   title={zh?"请输入 00:00–23:59，例如 22:00":"Enter 00:00–23:59, e.g. 22:00"}
   className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" />;
}
