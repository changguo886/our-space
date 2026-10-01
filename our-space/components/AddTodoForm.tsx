"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddTodoForm({
  userId,
  activeSpaceId,
  activeSpaceName,
  taskDate,
}: {
  userId: string;
  activeSpaceId: string;
  activeSpaceName: string;
  taskDate: string;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [visibility, setVisibility] =
    useState<"private" | "space">("private");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setError("请输入任务名称。");
      return;
    }

    const parsedMinutes = minutes
      ? Number(minutes)
      : null;

    if (
      parsedMinutes !== null &&
      (!Number.isFinite(parsedMinutes) ||
        parsedMinutes <= 0)
    ) {
      setError("预计时间需要是大于 0 的分钟数。");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .insert({
        user_id: userId,

        // null = 私人任务
        // 当前 Space ID = 分享到当前空间
        group_id:
          visibility === "space"
            ? activeSpaceId
            : null,

        title: cleanTitle,

        estimated_minutes:
          parsedMinutes,

        // 新增：明确记录这个 Todo 属于哪一天
        task_date: taskDate,
      });

    setBusy(false);

    if (error) {
      setError(
        "添加失败：" +
          error.message
      );
      return;
    }

    // 成功以后清空输入框
    setTitle("");
    setMinutes("");

    // 保留 visibility，
    // 这样用户连续添加任务时不用每次重新选
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3"
    >
      <input
        className="input"
        placeholder="今天想完成什么？"
        value={title}
        onChange={(e) =>
          setTitle(e.target.value)
        }
        disabled={busy}
      />

      <input
        className="input"
        type="number"
        min="1"
        step="1"
        placeholder="预计时间（分钟）"
        value={minutes}
        onChange={(e) =>
          setMinutes(e.target.value)
        }
        disabled={busy}
      />

      <select
        className="input"
        value={visibility}
        onChange={(e) =>
          setVisibility(
            e.target.value as
              | "private"
              | "space"
          )
        }
        disabled={busy}
      >
        <option value="private">
          仅自己可见
        </option>

        <option value="space">
          分享到 {activeSpaceName}
        </option>
      </select>

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy}
      >
        {busy
          ? "添加中…"
          : "添加任务"}
      </button>

      {error && (
        <p className="text-sm text-blush-500">
          {error}
        </p>
      )}
    </form>
  );
}
