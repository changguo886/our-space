"use client";

import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

type Category =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";

type CalendarTodo = {
  id: string;

  title: string;

  estimated_minutes:
    | number
    | null;

  status: string;

  group_id:
    | string
    | null;

  task_date:
    | string
    | null;

  scheduled_start:
    | string
    | null;

  scheduled_end:
    | string
    | null;

  category:
    | Category
    | null;

  custom_tag:
    | string
    | null;

  started_at:
    | string
    | null;

  elapsed_seconds:
    | number
    | null;
};

type Props = {
  initialTodos:
    CalendarTodo[];

  initialDate:
    string;
};

const CATEGORY_INFO: Record<
  Category,
  {
    label: string;
    card: string;
    badge: string;
  }
> = {
  work: {
    label: "工作",
    card:
      "border-blush-100 bg-blush-50",
    badge:
      "bg-blush-100 text-blush-500",
  },

  study: {
    label: "学习",
    card:
      "border-mist-100 bg-mist-50",
    badge:
      "bg-mist-100 text-mist-500",
  },

  life: {
    label: "生活",
    card:
      "border-sage-100 bg-sage-50",
    badge:
      "bg-sage-100 text-sage-700",
  },

  rest: {
    label: "休息",
    card:
      "border-[#EEE8F4] bg-[#F9F6FB]",
    badge:
      "bg-[#F0EAF5] text-[#826F91]",
  },

  other: {
    label: "其他",
    card:
      "border-[#F1E8DC] bg-[#FCF8F2]",
    badge:
      "bg-[#F3EBDD] text-[#8B7763]",
  },
};

function categoryOf(
  todo: CalendarTodo
) {
  if (!todo.category) {
    return {
      label:
        "未分类",

      card:
        "border-line bg-white",

      badge:
        "bg-black/[0.04] text-ink-faint",
    };
  }

  const base =
    CATEGORY_INFO[
      todo.category
    ];

  return {
    ...base,

    label:
      todo.category ===
        "other" &&
      todo.custom_tag?.trim()
        ? todo.custom_tag
        : base.label,
  };
}

function addDays(
  dateString: string,
  amount: number
) {
  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day + amount
    );

  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDateTitle(
  dateString: string
) {
  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  return new Intl.DateTimeFormat(
    "zh-CN",
    {
      month:
        "long",

      day:
        "numeric",

      weekday:
        "long",
    }
  ).format(date);
}

function localDatePart(
  iso: string
) {
  const date =
    new Date(iso);

  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatTime(
  iso: string
) {
  return new Date(
    iso
  ).toLocaleTimeString(
    [],
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      hour12:
        false,
    }
  );
}

export default function CalendarPlanner({
  initialTodos,
  initialDate,
}: Props) {
  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState(
      initialDate
    );

  /*
   * 未排期任务池
   */
  const unscheduledTodos =
    useMemo(
      () =>
        initialTodos.filter(
          (todo) =>
            !todo.scheduled_start
        ),
      [
        initialTodos,
      ]
    );

  /*
   * 当前日期的
   * 已排期任务
   */
  const scheduledTodos =
    useMemo(
      () =>
        initialTodos
          .filter(
            (todo) =>
              todo.scheduled_start &&
              localDatePart(
                todo.scheduled_start
              ) ===
                selectedDate
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.scheduled_start!
              ).getTime() -
              new Date(
                b.scheduled_start!
              ).getTime()
          ),
      [
        initialTodos,
        selectedDate,
      ]
    );

  /*
   * 第一版显示：
   * 08:00 - 24:00
   *
   * 下一步做拖拽时
   * 会拆成 15 分钟 slots。
   */
  const hours =
    Array.from(
      {
        length:
          17,
      },

      (
        _,
        index
      ) =>
        index + 8
    );

  return (
    <div className="mt-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            日历
          </h1>

          <p className="mt-1 text-sm text-ink-faint">
            拖一拖，把今天安排成喜欢的节奏。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
            onClick={() =>
              setSelectedDate(
                addDays(
                  selectedDate,
                  -1
                )
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-soft"
            onClick={() =>
              setSelectedDate(
                initialDate
              )
            }
          >
            今天
          </button>

          <button
            type="button"
            className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
            onClick={() =>
              setSelectedDate(
                addDays(
                  selectedDate,
                  1
                )
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/*
       * PC:
       * 左任务池 + 右日历
       *
       * 手机：
       * 这一步先上下排列。
       * 后面再换成抽屉。
       */}
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Task Pool */}
        <aside className="card h-fit p-4 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">
                任务池
              </h2>

              <p className="mt-1 text-xs text-ink-faint">
                拖到右边安排时间
              </p>
            </div>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/50"
              title="新建任务"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {unscheduledTodos.length ===
              0 && (
              <div className="rounded-2xl bg-sage-50 px-4 py-6 text-center">
                <p className="text-sm text-ink-soft">
                  暂时没有未排期任务
                </p>

                <p className="mt-1 text-xs text-ink-faint">
                  今天已经安排得很整齐啦。
                </p>
              </div>
            )}

            {unscheduledTodos.map(
              (
                todo
              ) => {
                const category =
                  categoryOf(
                    todo
                  );

                return (
                  <div
                    key={
                      todo.id
                    }
                    className={`flex cursor-grab items-center gap-3 rounded-2xl border px-3 py-3 shadow-[0_2px_10px_rgba(60,50,40,0.025)] transition hover:-translate-y-[1px] active:cursor-grabbing ${category.card}`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-ink-faint/50" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {
                          todo.title
                        }
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {todo.estimated_minutes && (
                          <span className="text-[11px] text-ink-faint">
                            {
                              todo.estimated_minutes
                            }{" "}
                            分钟
                          </span>
                        )}

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
                        >
                          {
                            category.label
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </aside>

        {/* Calendar */}
        <section className="card min-w-0 overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <p className="font-medium">
              {
                formatDateTitle(
                  selectedDate
                )
              }
            </p>

            <p className="mt-1 text-xs text-ink-faint">
              {
                scheduledTodos.length
              }{" "}
              个已排期任务
            </p>
          </div>

          <div className="relative">
            {hours.map(
              (
                hour
              ) => (
                <div
                  key={
                    hour
                  }
                  className="grid min-h-[72px] grid-cols-[58px_1fr]"
                >
                  <div className="border-r border-line px-3 pt-2 text-right text-[11px] text-ink-faint">
                    {
                      String(
                        hour
                      ).padStart(
                        2,
                        "0"
                      )
                    }
                    :00
                  </div>

                  <div className="relative border-b border-line/70" />
                </div>
              )
            )}

            {/*
             * 这一步先确认数据能显示。
             *
             * 下一步会把这些卡片
             * 按 scheduled_start
             * 真正计算 top / height。
             */}
            <div className="pointer-events-none absolute inset-y-0 left-[66px] right-3">
              {scheduledTodos.map(
                (
                  todo,
                  index
                ) => {
                  const category =
                    categoryOf(
                      todo
                    );

                  return (
                    <div
                      key={
                        todo.id
                      }
                      className={`pointer-events-auto absolute left-2 right-2 rounded-2xl border px-3 py-2 shadow-soft ${category.card}`}
                      style={{
                        top:
                          12 +
                          index *
                            82,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {
                              todo.title
                            }
                          </p>

                          <p className="mt-1 text-[11px] text-ink-faint">
                            {
                              formatTime(
                                todo.scheduled_start!
                              )
                            }

                            {todo.scheduled_end &&
                              ` – ${formatTime(
                                todo.scheduled_end
                              )}`}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
                        >
                          {
                            category.label
                          }
                        </span>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
