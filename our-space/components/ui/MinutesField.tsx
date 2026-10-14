"use client";

import { useEffect, useState } from "react";

/**
 * Duration entered as hours + minutes; the value stays a minutes string so callers
 * keep their existing validation (1–1440) and storage (planned_minutes).
 */
function split(value: string): [string, string] {
  const total = Number(value);
  if (!value.trim() || !Number.isFinite(total) || total < 0) return ["", ""];
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return [h ? String(h) : "", h && !m ? "" : String(m)];
}

function digits(raw: string): string {
  return raw.replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10)).replace(/\D/g, "").slice(0, 4);
}

export default function MinutesField({
  value,
  onChange,
  zh,
  disabled,
  label,
}: {
  value: string;
  onChange: (minutes: string) => void;
  zh: boolean;
  disabled?: boolean;
  /** Accessible name; the visible label is left to the caller. */
  label?: string;
}) {
  const [[hours, minutes], setParts] = useState<[string, string]>(() => split(value));

  // Follow outside changes (opening another plan, resetting the form) without fighting the user's typing.
  useEffect(() => {
    const own = (Number(hours || 0) * 60 + Number(minutes || 0)) || "";
    if (String(own) !== value.trim()) setParts(split(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function update(nextHours: string, nextMinutes: string) {
    setParts([nextHours, nextMinutes]);
    const total = Number(nextHours || 0) * 60 + Number(nextMinutes || 0);
    onChange(nextHours || nextMinutes ? String(total) : "");
  }

  const box =
    "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-sage-300 focus-within:ring-2 focus-within:ring-sage-100";
  const input = "w-full min-w-0 bg-transparent text-sm tabular-nums text-ink outline-none disabled:opacity-60";

  return (
    <div role="group" aria-label={label ?? (zh ? "时长" : "Duration")} className="mt-1 flex gap-2">
      <label className={box}>
        <input
          className={input}
          inputMode="numeric"
          placeholder="0"
          value={hours}
          disabled={disabled}
          onChange={(e) => update(digits(e.target.value), minutes)}
        />
        <span className="shrink-0 text-xs text-ink-faint">{zh ? "小时" : "h"}</span>
      </label>
      <label className={box}>
        <input
          className={input}
          inputMode="numeric"
          placeholder="0"
          value={minutes}
          disabled={disabled}
          onChange={(e) => update(hours, digits(e.target.value))}
        />
        <span className="shrink-0 text-xs text-ink-faint">{zh ? "分钟" : "min"}</span>
      </label>
    </div>
  );
}
