"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
      className="mt-4 flex w-full items-center justify-between rounded-xl bg-sage-50 px-4 py-3 text-left transition hover:bg-sage-100"
    >
      <span>
        <span className="block text-xs text-ink-faint">邀请码</span>
        <span className="font-mono text-lg tracking-[0.25em] text-sage-700">{code}</span>
      </span>
      {copied ? <Check className="h-4 w-4 text-sage-700" /> : <Copy className="h-4 w-4 text-ink-faint" />}
    </button>
  );
}
