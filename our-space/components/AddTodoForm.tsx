"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import DurationInput, {
  durationValueToMinutes,
  type DurationUnit,
} from "@/components/DurationInput";

type Category =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";

const CATEGORIES: {
  value: Category;
}[] = [
  { value: "work" },
  { value: "study" },
  { value: "life" },
  { value: "rest" },
  { value: "other" },
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
  const { dictionary } = useI18n();
  const t = dictionary.todo;

  const [title, setTitle] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [minutes, setMinutes] =
    useState("");

  const [
    durationUnit,
    setDurationUnit,
  ] =
    useState<DurationUnit>(
      "minute"
    );

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
        t.noTitle
      );
      return;
    }

    const parsedMinutes =
      durationValueToMinutes(
        minutes,
        durationUnit
      );

    if (
      parsedMinutes !== null &&
      Number.isNaN(
        parsedMinutes
      )
    ) {
      setError(
        t.invalidDuration
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
        t.addFailed +
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
          {t.task}
        </label>

        <input
          className="input"
          placeholder={t.taskPlaceholder}
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
          {t.taskDetails}
        </label>

        <textarea
          className="input min-h-[96px] w-full resize-y"
          placeholder={t.detailsPlaceholder}
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          disabled={busy}
        />

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          {t.detailsHelp}
        </p>
      </div>

      {/* 分类 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs text-ink-faint">
            {t.category}
          </label>

          {category && (
            <button
              type="button"
              onClick={() =>
                setCategory(null)
              }
              className="text-[11px] text-ink-faint transition hover:text-ink-soft"
            >
              {dictionary.common.clear}
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
                  {t.categories[item.value]}
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
            {t.customTag}
          </label>

          <input
            className="input"
            placeholder={t.customTagPlaceholder}
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
          {t.estimatedTime}
        </label>

        <DurationInput
          value={minutes}
          unit={durationUnit}
          onValueChange={
            setMinutes
          }
          onUnitChange={
            setDurationUnit
          }
          disabled={busy}
        />

        <p className="mt-1.5 text-[11px] text-ink-faint">
          {t.durationHelp}
        </p>
      </div>

      {/* 可见范围 */}
      <div>
        <label className="mb-1.5 block text-xs text-ink-faint">
          {t.visibility}
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
            {t.privateVisibility}
          </option>

          <option value="space">
            {t.shareToSpace.replace("{space}", activeSpaceName)}
          </option>
        </select>
      </div>

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy}
      >
        {busy
          ? t.adding
          : t.addTask}
      </button>

      {error && (
        <p className="text-sm text-blush-500">
          {error}
        </p>
      )}
    </form>
  );
}
