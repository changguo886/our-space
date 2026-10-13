"use client";
import { useI18n } from "@/components/I18nProvider";
import { normalizeTaskColor, TASK_COLOR_PRESETS } from "@/lib/task-colors";

export default function TaskColorPicker({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const {language}=useI18n();
  const zh=language==="zh-CN";
  const chosen=normalizeTaskColor(value);
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-ink-soft">{zh?"任务颜色（可选）":"Task color (optional)"}</span>
      <span className="text-xs text-ink-faint">{chosen}</span>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {TASK_COLOR_PRESETS.map(c=><button key={c} type="button" disabled={disabled} aria-label={c} aria-pressed={chosen===c} onClick={()=>onChange(c)}
        className={`h-8 w-8 rounded-full border-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${chosen===c?"border-ink":"border-white"}`} style={{backgroundColor:c}} />)}
      <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-white text-lg text-ink-soft" title={zh?"自定义调色盘":"Custom color picker"}>
        <span aria-hidden>+</span>
        <input type="color" value={chosen} disabled={disabled} aria-label={zh?"自定义颜色":"Custom color"} onChange={e=>onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </div>
  </div>;
}
