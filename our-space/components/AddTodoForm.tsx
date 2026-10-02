"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";

const CATEGORIES: {
  value: Category;
  label: string;
}[] = [
  {
    value: "work",
    label: "工作",
  },
  {
    value: "study",
    label: "学习",
  },
  {
    value: "life",
    label: "生活",
  },
  {
    value: "rest",
    label: "休息",
  },
  {
    value: "other",
    label: "其他",
  },
];

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

  const [title, setTitle] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [minutes, setMinutes] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<Category | null>(
      null
    );

  const [
    customTag,
    setCustomTag,
  ] = useState("");

  const [
    visibility,
    setVisibility,
  ] =
    useState<
      "private" | "space"
    >("private");

  const [busy, setBusy] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  async function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        "请输入任务名称。"
      );
      return;
    }

    const parsedMinutes =
      minutes
        ? Number(minutes)
        : null;

    if (
      parsedMinutes !== null &&
      (!Number.isFinite(
        parsedMinutes
      ) ||
        parsedMinutes <= 0)
    ) {
      setError(
        "预计时间需要是大于 0 的分钟数。"
      );
      return;
    }

    setBusy(true);
    setError(null);

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .insert({
          user_id: userId,

          /*
           * null = 私人任务
           * 当前 Space ID = 分享到当前空间
           */
          group_id:
            visibility ===
            "space"
              ? activeSpaceId
              : null,

          title:
            cleanTitle,

          /*
           * 任务细节 / 描述
           */
          description:
            description.trim()
              ? description.trim()
              : null,

          estimated_minutes:
            parsedMinutes,

          task_date:
            taskDate,

          category:
            category,

          custom_tag:
            customTag.trim()
              ? customTag.trim()
              : null,
        });

    setBusy(false);

    if (error) {
      setError(
        "添加失败：" +
          error.message
      );
      return;
    }

    /*
     * 成功后清空任务内容
     */
    setTitle("");
    setDescription("");
    setMinutes("");
    setCustomTag("");

    /*
     * category 和 visibility
     * 故意保留。
     *
     * 连续创建任务时，
     * 不需要每次重新选择。
     */
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      {/* 任务名称 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          任务
        </label>

        <input
          className="input"
          placeholder="想做什么？"
          value={title}
          onChange={(e) =>
            setTitle(
              e.target.value
            )
          }
          disabled={busy}
        />
      </div>

      {/* 任务细节 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          任务细节
        </label>

        <textarea
          className="input min-h-[96px] w-full resize-y"
          placeholder="比如：要做到什么程度、重点看什么、需要注意什么……"
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          disabled={busy}
        />

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          可选。适合写步骤、目标、资料位置或提醒。
        </p>
      </div>

      {/* 分类 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs text-ink-faint">
            分类
          </label>

          {category && (
            <button
              type="button"
              onClick={() =>
                setCategory(null)
              }
              className="text-[11px] text-ink-faint transition hover:text-ink-soft"
            >
              清除
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(
            (item) => {
              const selected =
                category ===
                item.value;

              return (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCategory(
                      item.value
                    );

                    /*
                     * 如果切换到非 other，
                     * 自动清掉之前的自定义标签。
                     */
                    if (
                      item.value !==
                      "other"
                    ) {
                      setCustomTag(
                        ""
                      );
                    }
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    selected
                      ? "border-sage-300 bg-sage-100 font-medium text-sage-700"
                      : "border-line bg-white/70 text-ink-soft hover:bg-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* 其他分类自定义标签 */}
      {category === "other" && (
        <div>
          <label className="mb-1.5 block text-xs text-ink-faint">
            自定义标签
          </label>

          <input
            className="input"
            placeholder="比如：健身 / 创作 / 社交"
            value={customTag}
            onChange={(e) =>
              setCustomTag(
                e.target.value
              )
            }
            disabled={busy}
          />
        </div>
      )}

      {/* 预计时间 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          预计时间
        </label>

        <input
          className="input"
          type="number"
          min="1"
          step="1"
          placeholder="例如 30 分钟"
          value={minutes}
          onChange={(e) =>
            setMinutes(
              e.target.value
            )
          }
          disabled={busy}
        />
      </div>

      {/* 可见范围 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          可见范围
        </label>

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
            分享到{" "}
            {activeSpaceName}
          </option>
        </select>
      </div>

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
