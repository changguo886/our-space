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

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  const minutes =
    unit === "hour"
      ? parsed * 60
      : parsed;

  return Math.max(1, Math.round(minutes));
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

    const parsed = Number(value);

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
    <div className="flex overflow-hidden rounded-xl border border-line bg-white/70 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100/70">
      <input
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none disabled:cursor-not-allowed disabled:opacity-60"
        type="number"
        min={unit === "hour" ? "0.1" : "1"}
        step={unit === "hour" ? "0.25" : "1"}
        placeholder={unit === "hour" ? "1.5" : "45"}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={disabled}
      />

      <select
        value={unit}
        onChange={(event) =>
          changeUnit(event.target.value as DurationUnit)
        }
        disabled={disabled}
        className="border-l border-line bg-paper/60 px-3 text-xs font-medium text-ink-soft outline-none disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={todo.estimatedTime}
      >
        <option value="minute">{common.minutes}</option>
        <option value="hour">{common.hours}</option>
      </select>
    </div>
  );
}
