"use client";

import Link from "next/link";

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

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";


import {
  createClient,
} from "@/lib/supabase/client";

/* =========================================================
   Types
========================================================= */

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

/* =========================================================
   Calendar constants
========================================================= */

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 24;

/*
 * 1 小时 = 72 px
 *
 * 所以：
 * 15 min = 18 px
 * 30 min = 36 px
 */
const HOUR_HEIGHT = 72;
const SLOT_MINUTES = 15;

const SLOT_HEIGHT =
  HOUR_HEIGHT / 4;

const TOTAL_MINUTES =
  (DAY_END_HOUR -
    DAY_START_HOUR) *
  60;

const TOTAL_HEIGHT =
  (DAY_END_HOUR -
    DAY_START_HOUR) *
  HOUR_HEIGHT;

/* =========================================================
   Category styles
========================================================= */

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
      label: "未分类",

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

/* =========================================================
   Date helpers
========================================================= */

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
    ).padStart(
      2,
      "0"
    );

  const d =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

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

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
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

/*
 * selectedDate + hour/minute
 * 转成本地时间 Date。
 */
function makeLocalDate(
  dateString: string,
  hour: number,
  minute: number
) {
  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );
}

/* =========================================================
   Slot helpers
========================================================= */

type TimeSlot = {
  id: string;

  hour: number;

  minute: number;

  minuteFromStart: number;
};

function buildSlots(
  date: string
): TimeSlot[] {
  const slots:
    TimeSlot[] = [];

  for (
    let minuteFromStart = 0;
    minuteFromStart <
    TOTAL_MINUTES;
    minuteFromStart +=
      SLOT_MINUTES
  ) {
    const absoluteMinutes =
      DAY_START_HOUR *
        60 +
      minuteFromStart;

    const hour =
      Math.floor(
        absoluteMinutes /
          60
      );

    const minute =
      absoluteMinutes %
      60;

    slots.push({
      id:
        `slot:${date}:${hour}:${minute}`,

      hour,

      minute,

      minuteFromStart,
    });
  }

  return slots;
}

function parseSlotId(
  id: string
) {
  const parts =
    id.split(":");

  if (
    parts.length !== 5 ||
    parts[0] !==
      "slot"
  ) {
    return null;
  }

  const date =
    parts[1];

  const hour =
    Number(
      parts[2]
    );

  const minute =
    Number(
      parts[3]
    );

  /*
   * id 格式是：
   *
   * slot:YYYY-MM-DD:HH:MM
   *
   * 但是 YYYY-MM-DD 本身没有 :
   * 所以实际上 split 后长度是 4。
   *
   * 为了兼容，
   * 下面重新解析。
   */
  return {
    date,
    hour,
    minute,
  };
}

/*
 * 上面的 parseSlotId
 * 改用更直接的版本。
 */
function readSlotId(
  id: string
) {
  if (
    !id.startsWith(
      "slot:"
    )
  ) {
    return null;
  }

  const raw =
    id.slice(5);

  const lastColon =
    raw.lastIndexOf(
      ":"
    );

  if (
    lastColon === -1
  ) {
    return null;
  }

  const secondLastColon =
    raw.lastIndexOf(
      ":",
      lastColon - 1
    );

  if (
    secondLastColon ===
    -1
  ) {
    return null;
  }

  const date =
    raw.slice(
      0,
      secondLastColon
    );

  const hour =
    Number(
      raw.slice(
        secondLastColon +
          1,
        lastColon
      )
    );

  const minute =
    Number(
      raw.slice(
        lastColon + 1
      )
    );

  if (
    !date ||
    !Number.isFinite(
      hour
    ) ||
    !Number.isFinite(
      minute
    )
  ) {
    return null;
  }

  return {
    date,
    hour,
    minute,
  };
}

/* =========================================================
   Draggable task card
========================================================= */

function DraggableTask({
  todo,
}: {
  todo: CalendarTodo;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } =
    useDraggable({
      id:
        `todo:${todo.id}`,

      data: {
        type:
          "todo",

        todoId:
          todo.id,
      },
    });

  const category =
    categoryOf(
      todo
    );

  const style:
    React.CSSProperties = {
    transform:
      CSS.Translate.toString(
        transform
      ),

    /*
     * 手机拖动时，
     * 不让浏览器把它误认为页面滚动。
     */
    touchAction:
      "none",
  };

  return (
    <div
      ref={
        setNodeRef
      }
      style={
        style
      }
      {...attributes}
      {...listeners}
      className={`
        flex
        cursor-grab
        items-center
        gap-3
        rounded-[18px]
        border
        px-3
        py-3
        transition
        duration-150
        active:cursor-grabbing
        ${category.card}

        ${
          isDragging
            ? "scale-[0.98] opacity-25"
            : "hover:-translate-y-[1px] hover:shadow-soft"
        }
      `}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-ink-faint/45" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {
            todo.title
          }
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-faint">
            {
              todo.estimated_minutes ??
              30
            }{" "}
            分钟
          </span>

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

/* =========================================================
   Drag overlay
========================================================= */

function DraggingTask({
  todo,
}: {
  todo: CalendarTodo;
}) {
  const category =
    categoryOf(
      todo
    );

  return (
    <div
      className={`
        flex
        w-[280px]
        rotate-[0.5deg]
        items-center
        gap-3
        rounded-[20px]
        border
        px-4
        py-3
        shadow-[0_14px_38px_rgba(70,60,50,0.13)]
        ${category.card}
      `}
      style={{
        transform:
          "scale(1.045, 0.97)",
      }}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-ink-faint/45" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {
            todo.title
          }
        </p>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-ink-faint">
            {
              todo.estimated_minutes ??
              30
            }{" "}
            分钟
          </span>

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

/* =========================================================
   Droppable 15-minute slot
========================================================= */

function DroppableSlot({
  slot,
  dragging,
}: {
  slot: TimeSlot;
  dragging: boolean;
}) {
  const {
    setNodeRef,
    isOver,
  } =
    useDroppable({
      id:
        slot.id,

      data: {
        type:
          "slot",

        date:
          slot.id,

        hour:
          slot.hour,

        minute:
          slot.minute,
      },
    });

  const strongLine =
    slot.minute === 0;

  const halfLine =
    slot.minute === 30;

  return (
    <div
      ref={
        setNodeRef
      }
      style={{
        height:
          SLOT_HEIGHT,
      }}
      className={`
        relative
        transition
        duration-100

        ${
          strongLine
            ? "border-t border-line"
            : halfLine
              ? "border-t border-line/55"
              : "border-t border-line/25"
        }

        ${
          dragging
            ? "bg-white/20"
            : ""
        }

        ${
          isOver
            ? "z-10 bg-sage-100/80"
            : ""
        }
      `}
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2">
          <div className="rounded-full border border-sage-300/70 bg-sage-50 px-3 py-1 text-center text-[10px] font-medium text-sage-700 shadow-sm">
            {String(
              slot.hour
            ).padStart(
              2,
              "0"
            )}
            :
            {String(
              slot.minute
            ).padStart(
              2,
              "0"
            )}
            {" · "}
            松开放到这里
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Scheduled calendar card
========================================================= */

function ScheduledTask({
  todo,
}: {
  todo: CalendarTodo;
}) {
  const category =
    categoryOf(
      todo
    );

  if (
    !todo.scheduled_start
  ) {
    return null;
  }

  const start =
    new Date(
      todo.scheduled_start
    );

  const startMinutes =
    start.getHours() *
      60 +
    start.getMinutes();

  const minutesFromStart =
    startMinutes -
    DAY_START_HOUR *
      60;

  /*
   * 当前第一版：
   * 超出 08:00–24:00 的任务
   * 暂时不画。
   */
  if (
    minutesFromStart <
      0 ||
    minutesFromStart >=
      TOTAL_MINUTES
  ) {
    return null;
  }

  let duration =
    todo.estimated_minutes ??
    30;

  if (
    todo.scheduled_end
  ) {
    const end =
      new Date(
        todo.scheduled_end
      );

    const calculated =
      Math.round(
        (
          end.getTime() -
          start.getTime()
        ) /
          60000
      );

    if (
      calculated >
      0
    ) {
      duration =
        calculated;
    }
  }

  const top =
    (
      minutesFromStart /
      60
    ) *
    HOUR_HEIGHT;

  const height =
    Math.max(
      30,
      (
        duration /
        60
      ) *
        HOUR_HEIGHT
    );

  return (
    <div
      className={`
        absolute
        left-2
        right-2
        z-20
        overflow-hidden
        rounded-[18px]
        border
        px-3
        py-2
        shadow-[0_4px_16px_rgba(60,50,40,0.045)]
        transition
        hover:shadow-soft
        ${category.card}
      `}
      style={{
        top,
        height,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {
              todo.title
            }
          </p>

          <p className="mt-0.5 text-[11px] text-ink-faint">
            {
              formatTime(
                todo.scheduled_start
              )
            }

            {todo.scheduled_end &&
              ` – ${formatTime(
                todo.scheduled_end
              )}`}
          </p>
        </div>

        {height >=
          40 && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
          >
            {
              category.label
            }
          </span>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Main Calendar
========================================================= */

export default function CalendarPlanner({
  initialTodos,
  initialDate,
}: Props) {
  const [
    todos,
    setTodos,
  ] =
    useState<
      CalendarTodo[]
    >(
      initialTodos
    );

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState(
      initialDate
    );

  const [
    activeTodoId,
    setActiveTodoId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    savingTodoId,
    setSavingTodoId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  /*
   * 鼠标稍微移动后才算拖动，
   * 避免普通点击误触。
   *
   * 手机则长按一点点
   * 再开始拖。
   */
  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint:
            {
              distance: 6,
            },
        }
      ),

      useSensor(
        TouchSensor,
        {
          activationConstraint:
            {
              delay: 180,
              tolerance: 8,
            },
        }
      )
    );

  const slots =
    useMemo(
      () =>
        buildSlots(
          selectedDate
        ),
      [
        selectedDate,
      ]
    );

  /*
   * 未排期任务。
   */
  const unscheduledTodos =
    useMemo(
      () =>
        todos.filter(
          (todo) =>
            !todo.scheduled_start
        ),
      [
        todos,
      ]
    );

  /*
   * 当前这一天已经排好的任务。
   */
  const scheduledTodos =
    useMemo(
      () =>
        todos
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
        todos,
        selectedDate,
      ]
    );

  const activeTodo =
    useMemo(
      () =>
        todos.find(
          (todo) =>
            todo.id ===
            activeTodoId
        ) ??
        null,
      [
        todos,
        activeTodoId,
      ]
    );

  const hours =
    Array.from(
      {
        length:
          DAY_END_HOUR -
          DAY_START_HOUR +
          1,
      },

      (
        _,
        index
      ) =>
        DAY_START_HOUR +
        index
    );

  function handleDragStart(
    event:
      DragStartEvent
  ) {
    const id =
      String(
        event.active.id
      );

    if (
      !id.startsWith(
        "todo:"
      )
    ) {
      return;
    }

    setActiveTodoId(
      id.slice(5)
    );

    setError(null);
  }

  async function handleDragEnd(
    event:
      DragEndEvent
  ) {
    const activeId =
      String(
        event.active.id
      );

    const overId =
      event.over
        ? String(
            event.over.id
          )
        : null;

    setActiveTodoId(
      null
    );

    if (
      !activeId.startsWith(
        "todo:"
      ) ||
      !overId
    ) {
      return;
    }

    const todoId =
      activeId.slice(
        5
      );

    const slot =
      readSlotId(
        overId
      );

    if (!slot) {
      return;
    }

    const todo =
      todos.find(
        (item) =>
          item.id ===
          todoId
      );

    if (!todo) {
      return;
    }

    const duration =
      todo.estimated_minutes ??
      30;

    const startDate =
      makeLocalDate(
        slot.date,
        slot.hour,
        slot.minute
      );

    const endDate =
      new Date(
        startDate.getTime() +
          duration *
            60 *
            1000
      );

    const startIso =
      startDate.toISOString();

    const endIso =
      endDate.toISOString();

    /*
     * 保存前先留一个旧版本。
     * 如果 Supabase 失败，
     * 我们可以恢复。
     */
    const previousTodos =
      todos;

    /*
     * Optimistic UI：
     * 松手以后马上“吸进去”，
     * 不需要等网络请求结束。
     */
    setTodos(
      (
        current
      ) =>
        current.map(
          (item) =>
            item.id ===
            todoId
              ? {
                  ...item,

                  task_date:
                    slot.date,

                  scheduled_start:
                    startIso,

                  scheduled_end:
                    endIso,
                }
              : item
        )
    );

    setSavingTodoId(
      todoId
    );

    setError(null);

    const supabase =
      createClient();

    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          "todos"
        )
        .update({
          task_date:
            slot.date,

          scheduled_start:
            startIso,

          scheduled_end:
            endIso,
        })
        .eq(
          "id",
          todoId
        );

    setSavingTodoId(
      null
    );

    if (
      updateError
    ) {
      /*
       * 保存失败就恢复
       * 拖动之前的位置。
       */
      setTodos(
        previousTodos
      );

      setError(
        "排期保存失败：" +
          updateError.message
      );
    }
  }

  return (
    <DndContext
      sensors={
        sensors
      }
      collisionDetection={
        pointerWithin
      }
      onDragStart={
        handleDragStart
      }
      onDragCancel={() =>
        setActiveTodoId(
          null
        )
      }
      onDragEnd={
        handleDragEnd
      }
    >
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
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-sage-50"
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

        {error && (
          <div className="mb-4 rounded-2xl border border-blush-100 bg-blush-50 px-4 py-3 text-sm text-blush-500">
            {
              error
            }
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* =================================================
              Task Pool
          ================================================= */}

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">
                  任务池
                </h2>

                <p className="mt-1 text-xs text-ink-faint">
                  按住任务，拖到右边的时间里
                </p>
              </div>

              <Link
                href="/todo"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/50"
                title="新建任务"
              >
                <Plus className="h-4 w-4" />
              </Link>
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
                ) => (
                  <DraggableTask
                    key={
                      todo.id
                    }
                    todo={
                      todo
                    }
                  />
                )
              )}
            </div>
          </aside>

          {/* =================================================
              Calendar
          ================================================= */}

          <section className="card min-w-0 overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
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

                {activeTodo && (
                  <div className="hidden rounded-full bg-sage-50 px-3 py-1.5 text-xs text-sage-700 sm:block">
                    松手即可安排
                  </div>
                )}
              </div>
            </div>

            <div
              className="relative"
              style={{
                height:
                  TOTAL_HEIGHT,
              }}
            >
              {/* 时间标签 */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-[64px] border-r border-line">
                {hours.map(
                  (
                    hour,
                    index
                  ) => (
                    <div
                      key={
                        hour
                      }
                      className="absolute right-3 -translate-y-1/2 text-[11px] text-ink-faint"
                      style={{
                        top:
                          index *
                          HOUR_HEIGHT,
                      }}
                    >
                      {String(
                        hour
                      ).padStart(
                        2,
                        "0"
                      )}
                      :00
                    </div>
                  )
                )}
              </div>

              {/* 15-minute Drop Zones */}
              <div className="absolute inset-y-0 left-[64px] right-0">
                {slots.map(
                  (
                    slot
                  ) => (
                    <DroppableSlot
                      key={
                        slot.id
                      }
                      slot={
                        slot
                      }
                      dragging={
                        !!activeTodo
                      }
                    />
                  )
                )}

                {/* 已排期任务 */}
                <div className="pointer-events-none absolute inset-0">
                  {scheduledTodos.map(
                    (
                      todo
                    ) => (
                      <div
                        key={
                          todo.id
                        }
                        className="pointer-events-auto"
                      >
                        <ScheduledTask
                          todo={
                            todo
                          }
                        />

                        {savingTodoId ===
                          todo.id && (
                          <span className="sr-only">
                            保存中
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* =====================================================
          Floating drag preview
      ====================================================== */}

      <DragOverlay
        dropAnimation={{
          duration:
            230,

          easing:
            "cubic-bezier(0.18, 0.75, 0.35, 1.25)",
        }}
      >
        {activeTodo ? (
          <DraggingTask
            todo={
              activeTodo
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
