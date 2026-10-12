"use client";

import { useI18n } from "@/components/I18nProvider";

export type DurationUnit =
  | "minute"
  | "hour";

type DurationInputProps = {
  value: string;
  unit: DurationUnit;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: DurationUnit) => void;
  disabled?: boolean;
};

export function durationValueToMinutes(
  value: string,
  unit: DurationUnit
): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(normalizeDurationInput(value));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  const minutes =
    unit === "hour"
      ? parsed * 60
      : parsed;

  return Math.max(1, Math.round(minutes));
}

function normalizeDurationInput(input: string) {
  return input.replace(/[０-９]/g, ch => String(ch.charCodeAt(0) - 0xFF10))
    .replace(/[．。]/g, ".").replace(/，/g, ",")
    .replace(/,/g, ".").trim();
}

function trimNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

export default function DurationInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
  disabled = false,
}: DurationInputProps) {
  const { dictionary } = useI18n();
  const common = dictionary.common;
  const todo = dictionary.todo;

  function changeUnit(nextUnit: DurationUnit) {
    if (nextUnit === unit) {
      return;
    }

    const parsed = Number(normalizeDurationInput(value));

    if (value.trim() && Number.isFinite(parsed) && parsed > 0) {
      const converted =
        unit === "minute" && nextUnit === "hour"
          ? parsed / 60
          : parsed * 60;

      onValueChange(trimNumber(converted));
    }

    onUnitChange(nextUnit);
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-[52px] items-stretch overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100/70">
        <input
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-medium tabular-nums text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
          type="text"
          inputMode="decimal"
          aria-label={todo.estimatedTime}
          placeholder={unit==="hour"?"1.5":"45"}
          value={value}
          onChange={event=>onValueChange(event.target.value)}
          disabled={disabled}
        />
        <div role="group" aria-label={todo.estimatedTime} className="flex shrink-0 items-center gap-1 border-l border-line bg-paper/70 p-1.5">
          {(["minute","hour"] as DurationUnit[]).map(option=>
            <button key={option} type="button" disabled={disabled}
              aria-pressed={unit===option}
              onClick={()=>changeUnit(option)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${unit===option?"bg-white text-sage-700 shadow-sm ring-1 ring-sage-200":"text-ink-faint hover:text-ink"}`}>
              {option==="minute"?common.minutes:common.hours}
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
