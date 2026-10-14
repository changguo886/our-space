"use client";
import { CalendarClock, Clock, Shuffle } from "lucide-react";
import type { ScheduleMode as Mode } from "@/lib/schedule-utils";

export function modeLabel(mode: Mode, zh: boolean) {
  return mode === "fixed" ? (zh ? "固定时段" : "Fixed") : mode === "window" ? (zh ? "时间窗" : "Window") : (zh ? "不定时" : "Anytime");
}

export function ModeIcon({ mode, zh }: { mode: Mode; zh: boolean }) {
  const Icon = mode === "fixed" ? CalendarClock : mode === "window" ? Clock : Shuffle;
  return <Icon role="img" aria-label={modeLabel(mode, zh)} className="h-4 w-4 shrink-0 text-sage-700" />;
}

export function ModePicker({ value, onChange, zh, compact = false }: { value: Mode; onChange: (m: Mode) => void; zh: boolean; compact?: boolean }) {
  return <div className="grid grid-cols-3 gap-2">
    {(["flexible", "window", "fixed"] as const).map((id) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 ${compact ? "py-1.5" : "py-2.5"} text-xs ${value === id ? "border-sage-500 bg-sage-50 font-semibold text-sage-700" : "border-line text-ink-soft"}`}>
      <ModeIcon mode={id} zh={zh} />{modeLabel(id, zh)}
    </button>)}
  </div>;
}
