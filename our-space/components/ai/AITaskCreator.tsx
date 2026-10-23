"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { TaskDraft } from "@/lib/ai/task-draft";

/** One-line natural-language input that fills the create form below it. Never saves anything. */
export default function AITaskCreator({ onDraft, disabled, zh }: {
  onDraft: (draft: TaskDraft) => void;
  disabled?: boolean;
  zh: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/task-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.draft) throw new Error(payload.error || (zh ? "生成失败" : "Could not generate"));
      onDraft(payload.draft as TaskDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : zh ? "生成失败" : "Could not generate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2 rounded-xl border border-sage-100 bg-sage-50/50 p-2">
        <Sparkles className="mt-2 h-4 w-4 shrink-0 text-sage-500" aria-hidden />
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} rows={1}
          disabled={disabled || busy}
          aria-label={zh ? "用一句话描述任务" : "Describe the task"}
          placeholder={zh ? "一句话描述，例如：下周五前交统计分析报告" : "Describe it, e.g. finish the stats report by next Friday"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void generate(); } }}
          className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink outline-none" />
        <button type="button" onClick={() => void generate()} disabled={disabled || busy || !prompt.trim()}
          className="shrink-0 rounded-lg bg-sage-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
          {busy ? (zh ? "生成中…" : "Working…") : (zh ? "生成" : "Draft")}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-blush-500">{error}</p>}
    </div>
  );
}
