"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddTodoForm({
  userId,
  activeSpaceId,
  activeSpaceName,
}: {
  userId: string;
  activeSpaceId: string;
  activeSpaceName: string;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [visibility, setVisibility] = useState<"private" | "space">("private");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setError("请输入任务名称。");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase.from("todos").insert({
      user_id: userId,
      group_id: visibility === "space" ? activeSpaceId : null,
      title: cleanTitle,
      estimated_minutes: minutes ? Number(minutes) : null,
    });

    setBusy(false);

    if (error) {
      setError("添加失败：" + error.message);
      return;
    }

    setTitle("");
    setMinutes("");

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input"
        placeholder="今天想完成什么？"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        className="input"
        type="number"
        min="1"
        placeholder="预计时间（分钟）"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
      />

      <select
        className="input"
        value={visibility}
        onChange={(e) =>
          setVisibility(e.target.value as "private" | "space")
        }
      >
        <option value="private">仅自己可见</option>
        <option value="space">
          分享到 {activeSpaceName}
        </option>
      </select>

      <button
        className="btn-primary w-full"
        disabled={busy}
      >
        {busy ? "添加中…" : "添加任务"}
      </button>

      {error && (
        <p className="text-sm text-blush-500">
          {error}
        </p>
      )}
    </form>
  );
}
