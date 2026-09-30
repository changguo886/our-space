"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REACTIONS, type ReactionType } from "@/lib/utils";

type R = { user_id: string; reaction_type: ReactionType };

export default function ReactionBar({
  entryId,
  userId,
  isOwn,
  initial,
  size = "sm",
}: {
  entryId: string;
  userId: string;
  isOwn: boolean;
  initial: R[];
  size?: "sm" | "md";
}) {
  const [reactions, setReactions] = useState<R[]>(initial);
  const [busy, setBusy] = useState(false);
  const mine = reactions.find((r) => r.user_id === userId)?.reaction_type;

  async function toggle(type: ReactionType) {
    if (isOwn || busy) return;
    const prev = reactions;
    const next = reactions.filter((r) => r.user_id !== userId);
    if (mine !== type) next.push({ user_id: userId, reaction_type: type });
    setReactions(next); // 先更新界面，感觉更快
    setBusy(true);
    const supabase = createClient();
    const { error } =
      mine === type
        ? await supabase.from("reactions").delete().eq("entry_id", entryId).eq("user_id", userId)
        : await supabase
            .from("reactions")
            .upsert({ entry_id: entryId, user_id: userId, reaction_type: type }, { onConflict: "entry_id,user_id" });
    if (error) setReactions(prev);
    setBusy(false);
  }

  const pad = size === "md" ? "px-3.5 py-2 text-sm" : "px-3 py-1.5 text-[13px]";

  return (
    <div className="flex flex-wrap gap-2">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count = reactions.filter((r) => r.reaction_type === type).length;
        if (isOwn && count === 0) return null;
        const on = mine === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            disabled={isOwn}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border transition ${pad} ${
              on
                ? "border-blush-100 bg-blush-50 text-ink"
                : "border-line bg-white/70 text-ink-soft hover:bg-white"
            } ${isOwn ? "cursor-default" : "active:scale-95"}`}
          >
            <span>{emoji}</span>
            <span>{label}</span>
            {count > 0 && <span className="tabular-nums text-ink-faint">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
