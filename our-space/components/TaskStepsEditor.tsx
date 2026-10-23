"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Sparkles, X } from "lucide-react";

export type StepDraft = {
  key: string;
  title: string;
  minutes: number | null;
  source: "manual" | "ai";
};

export const newStepKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());

export default function TaskStepsEditor({ steps, onChange, disabled, zh }: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  disabled?: boolean;
  zh: boolean;
}) {
  const [adding, setAdding] = useState("");
  const update = (key: string, patch: Partial<StepDraft>) => onChange(steps.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) => {
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const add = () => {
    const title = adding.trim();
    if (!title) return;
    onChange([...steps, { key: newStepKey(), title: title.slice(0, 160), minutes: null, source: "manual" }]);
    setAdding("");
  };
  const total = steps.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const icon = "rounded p-1 text-ink-faint hover:bg-paper hover:text-ink disabled:opacity-30";

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-ink-soft">{zh ? "步骤" : "Steps"}{steps.length ? ` · ${steps.length}` : ""}</p>
        {total > 0 && <p className="text-[11px] text-ink-faint">{zh ? `约 ${total} 分钟` : `~${total} min`}</p>}
      </div>
      {steps.length > 0 && <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5">
            <span className="w-4 shrink-0 text-center text-[11px] text-ink-faint">
              {step.source === "ai" ? <Sparkles className="inline h-3 w-3 text-sage-500" aria-label="AI" /> : i + 1}
            </span>
            <input aria-label={zh ? `步骤 ${i + 1}` : `Step ${i + 1}`} value={step.title} maxLength={160} disabled={disabled}
              onChange={e => update(step.key, { title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
            <input aria-label={zh ? `步骤 ${i + 1} 预计分钟` : `Step ${i + 1} minutes`} type="number" min={1} max={600} disabled={disabled}
              value={step.minutes ?? ""} placeholder={zh ? "分钟" : "min"}
              onChange={e => { const n = Number(e.target.value); update(step.key, { minutes: e.target.value && n > 0 ? Math.min(600, Math.round(n)) : null }); }}
              className="w-14 shrink-0 rounded border border-line px-1.5 py-0.5 text-right text-xs text-ink-soft" />
            <button type="button" className={icon} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={zh ? "上移" : "Move up"}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className={icon} disabled={disabled || i === steps.length - 1} onClick={() => move(i, 1)} aria-label={zh ? "下移" : "Move down"}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className={icon} disabled={disabled} onClick={() => onChange(steps.filter(s => s.key !== step.key))} aria-label={zh ? "删除步骤" : "Remove step"}><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ol>}
      <input value={adding} disabled={disabled || steps.length >= 20} maxLength={160}
        onChange={e => setAdding(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={zh ? "+ 添加步骤，回车确认" : "+ Add a step, press Enter"}
        className="w-full rounded-lg border border-dashed border-line bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-sage-300" />
    </section>
  );
}
