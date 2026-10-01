"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";

import { EntryBody } from "@/components/EntryCardBody";
import {
  formatLongDate,
  hasContent,
} from "@/lib/utils";

export type HistoryEntry = {
  id: string;
  entry_date: string;
  today_tasks: string | null;
  today_note: string | null;
  tomorrow_plan: string | null;
};

export type HistoryTodo = {
  id: string;
  title: string;
  task_date: string;
  status: string;
  estimated_minutes: number | null;
  elapsed_seconds: number;
  completed_at: string | null;
  group_id: string | null;
};

const WEEK = [
  "日",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
];

const pad = (n: number) =>
  String(n).padStart(2, "0");

function formatFocusTime(
  seconds: number
) {
  const safe = Math.max(
    0,
    Math.floor(seconds)
  );

  const hours = Math.floor(
    safe / 3600
  );

  const minutes = Math.floor(
    (safe % 3600) / 60
  );

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }

  if (minutes > 0) {
    return `${minutes} 分钟`;
  }

  return `${safe} 秒`;
}

export default function HistoryView({
  entries,
  todos,
  today,
}: {
  entries: HistoryEntry[];
  todos: HistoryTodo[];
  today: string;
}) {
  /*
   * 日记按日期索引
   */
  const byDate = useMemo(
    () =>
      new Map(
        entries.map((e) => [
          e.entry_date,
          e,
        ])
      ),
    [entries]
  );

  /*
   * Todo 按日期索引
   *
   * 例如：
   * 2026-10-01
   * -> [todo1, todo2, todo3]
   */
  const todosByDate =
    useMemo(() => {
      const map = new Map<
        string,
        HistoryTodo[]
      >();

      for (const todo of todos) {
        const existing =
          map.get(
            todo.task_date
          ) ?? [];

        existing.push(todo);

        map.set(
          todo.task_date,
          existing
        );
      }

      return map;
    }, [todos]);

  const [view, setView] =
    useState<
      "calendar" | "timeline"
    >("calendar");

  const [ym, setYm] =
    useState(() => ({
      y: Number(
        today.slice(0, 4)
      ),
      m: Number(
        today.slice(5, 7)
      ),
    }));

  /*
   * 默认选今天。
   *
   * 如果今天没有任何日记或 Todo，
   * 就选最近有记录的一天。
   */
  const latestTodoDate =
    todos[0]?.task_date;

  const latestEntryDate =
    entries[0]?.entry_date;

  const fallbackDate =
    [
      latestTodoDate,
      latestEntryDate,
    ]
      .filter(
        (
          date
        ): date is string =>
          Boolean(date)
      )
      .sort()
      .reverse()[0] ??
    today;

  const todayHasContent =
    byDate.has(today) ||
    (
      todosByDate.get(
        today
      ) ?? []
    ).length > 0;

  const [
    selected,
    setSelected,
  ] = useState<string>(
    todayHasContent
      ? today
      : fallbackDate
  );

  /*
   * 当前月份日历格子
   */
  const days = useMemo(
    () => {
      const first =
        new Date(
          Date.UTC(
            ym.y,
            ym.m - 1,
            1
          )
        ).getUTCDay();

      const count =
        new Date(
          Date.UTC(
            ym.y,
            ym.m,
            0
          )
        ).getUTCDate();

      return [
        ...Array(
          first
        ).fill(null),

        ...Array.from(
          {
            length: count,
          },
          (_, i) =>
            i + 1
        ),
      ] as (
        | number
        | null
      )[];
    },
    [ym]
  );

  /*
   * 切换月份
   */
  const shift = (
    d: number
  ) =>
    setYm(
      ({ y, m }) => {
        const t =
          m + d;

        return t < 1
          ? {
              y: y - 1,
              m: 12,
            }
          : t > 12
            ? {
                y: y + 1,
                m: 1,
              }
            : {
                y,
                m: t,
              };
      }
    );

  /*
   * 当前选中日期的数据
   */
  const selectedEntry =
    byDate.get(selected);

  const selectedTodos =
    todosByDate.get(
      selected
    ) ?? [];

  const completedTodos =
    selectedTodos.filter(
      (todo) =>
        todo.status ===
        "completed"
    );

  /*
   * 原来的 timeline
   * 目前继续按日记月份分组
   */
  const months = useMemo(
    () => {
      const groups: {
        key: string;
        items: HistoryEntry[];
      }[] = [];

      for (const e of entries) {
        const key =
          e.entry_date.slice(
            0,
            7
          );

        if (
          groups.at(-1)
            ?.key !== key
        ) {
          groups.push({
            key,
            items: [],
          });
        }

        groups
          .at(-1)!
          .items.push(e);
      }

      return groups;
    },
    [entries]
  );

  return (
    <>
      {/* View switch */}
      <div className="mt-5 inline-flex rounded-xl bg-black/[0.04] p-1 text-sm">
        {(
          [
            "calendar",
            "timeline",
          ] as const
        ).map((v) => (
          <button
            key={v}
            onClick={() =>
              setView(v)
            }
            className={`rounded-lg px-4 py-1.5 transition ${
              view === v
                ? "bg-paper font-medium shadow-soft"
                : "text-ink-soft"
            }`}
          >
            {v ===
            "calendar"
              ? "日历"
              : "时间线"}
          </button>
        ))}
      </div>

      {view ===
      "calendar" ? (
        <>
          {/* Calendar */}
          <div className="card mt-4 p-4 md:p-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() =>
                  shift(-1)
                }
                className="btn-ghost px-2"
                aria-label="上个月"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <p className="font-medium">
                {ym.y}年{" "}
                {ym.m}月
              </p>

              <button
                onClick={() =>
                  shift(1)
                }
                className="btn-ghost px-2"
                aria-label="下个月"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Week header */}
            <div className="mt-4 grid grid-cols-7 gap-y-1 text-center text-xs text-ink-faint">
              {WEEK.map(
                (w) => (
                  <div
                    key={w}
                    className="py-1"
                  >
                    {w}
                  </div>
                )
              )}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {days.map(
                (
                  d,
                  i
                ) => {
                  if (!d) {
                    return (
                      <div
                        key={`b${i}`}
                      />
                    );
                  }

                  const date =
                    `${ym.y}-${pad(
                      ym.m
                    )}-${pad(
                      d
                    )}`;

                  const hasEntry =
                    byDate.has(
                      date
                    );

                  const dayTodos =
                    todosByDate.get(
                      date
                    ) ?? [];

                  const hasTodo =
                    dayTodos.length >
                    0;

                  const has =
                    hasEntry ||
                    hasTodo;

                  const isSel =
                    date ===
                    selected;

                  const isToday =
                    date ===
                    today;

                  return (
                    <div
                      key={
                        date
                      }
                      className="flex justify-center"
                    >
                      <button
                        onClick={() =>
                          setSelected(
                            date
                          )
                        }
                        className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm transition ${
                          isSel
                            ? "bg-sage-500 font-medium text-white"
                            : has
                              ? "bg-sage-100 text-sage-700 hover:bg-sage-300/60"
                              : "text-ink-soft hover:bg-black/[0.04]"
                        } ${
                          isToday &&
                          !isSel
                            ? "ring-1 ring-sage-300"
                            : ""
                        }`}
                      >
                        {d}

                        {/* Todo 小点 */}
                        {hasTodo &&
                          !isSel && (
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-sage-500" />
                          )}
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* Selected date */}
          <div className="mt-6">
            <p className="text-sm text-ink-soft">
              {formatLongDate(
                selected
              )}
            </p>

            {/* Daily Entry */}
            {selectedEntry ? (
              <Link
                href={`/entry/${selectedEntry.id}`}
                className="mt-2 block transition hover:opacity-90"
              >
                <EntryBody
                  entry={
                    selectedEntry
                  }
                  tint="bg-blush-50"
                />

                <p className="mt-2 text-right text-xs text-ink-faint">
                  查看朋友们的回应 →
                </p>
              </Link>
            ) : (
              <p className="mt-2 rounded-2xl bg-black/[0.02] px-5 py-6 text-center text-sm text-ink-faint">
                这一天没有日记记录。
              </p>
            )}

            {/* Todo History */}
            {selectedTodos.length >
              0 && (
              <div className="card mt-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">
                      Todo
                    </h3>

                    <p className="mt-1 text-xs text-ink-faint">
                      这一天安排的任务
                    </p>
                  </div>

                  <span className="text-sm font-medium text-sage-700">
                    {
                      completedTodos.length
                    }
                    /
                    {
                      selectedTodos.length
                    }{" "}
                    完成
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {selectedTodos.map(
                    (
                      todo
                    ) => {
                      const completed =
                        todo.status ===
                        "completed";

                      return (
                        <div
                          key={
                            todo.id
                          }
                          className="flex items-start gap-3"
                        >
                          {/* Status */}
                          <div
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                              completed
                                ? "bg-sage-500 text-white"
                                : "border border-line bg-paper text-ink-faint"
                            }`}
                          >
                            {completed && (
                              <Check className="h-4 w-4" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <p
                              className={
                                completed
                                  ? "text-sm text-ink-faint line-through"
                                  : "text-sm text-ink"
                              }
                            >
                              {
                                todo.title
                              }
                            </p>

                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
                              {todo.estimated_minutes && (
                                <span>
                                  预计{" "}
                                  {
                                    todo.estimated_minutes
                                  }{" "}
                                  分钟
                                </span>
                              )}

                              {todo.elapsed_seconds >
                                0 && (
                                <span>
                                  实际专注{" "}
                                  {formatFocusTime(
                                    todo.elapsed_seconds
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}

            {/* Nothing */}
            {!selectedEntry &&
              selectedTodos.length ===
                0 && (
                <p className="mt-4 text-center text-sm text-ink-faint">
                  这一天没有留下什么记录，也没关系 🌙
                </p>
              )}
          </div>
        </>
      ) : (
        /*
         * Timeline
         *
         * 第一版暂时继续只显示 Daily Entry。
         * 等 Calendar + Todo 稳定以后，
         * 再把 Timeline 升级成 Daily Entry + Todo。
         */
        <div className="mt-4 space-y-8">
          {months.length ===
            0 && (
            <p className="text-sm text-ink-faint">
              还没有记录。
            </p>
          )}

          {months.map(
            ({
              key,
              items,
            }) => (
              <section
                key={key}
              >
                <h2 className="sticky top-0 z-10 bg-cream/90 py-2 text-sm font-medium text-ink-soft backdrop-blur">
                  {Number(
                    key.slice(
                      0,
                      4
                    )
                  )}
                  年
                  {Number(
                    key.slice(
                      5
                    )
                  )}
                  月
                </h2>

                <div className="mt-2 space-y-3">
                  {items
                    .filter(
                      hasContent
                    )
                    .map(
                      (e) => (
                        <Link
                          key={
                            e.id
                          }
                          href={`/entry/${e.id}`}
                          className="block transition hover:opacity-90"
                        >
                          <p className="mb-1.5 text-xs text-ink-faint">
                            {formatLongDate(
                              e.entry_date
                            )}
                          </p>

                          <EntryBody
                            entry={
                              e
                            }
                            tint="bg-paper border border-line"
                          />
                        </Link>
                      )
                    )}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </>
  );
}
