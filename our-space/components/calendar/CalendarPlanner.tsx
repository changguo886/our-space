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
 * 现在每小时 96px
 *
 * 15 min = 24px
 * 30 min = 48px
 * 45 min = 72px
 * 60 min = 96px
 *
 * 这样任务之间的“长短”会明显很多。
 */
const HOUR_HEIGHT = 96;

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
   Category style
   和 Todo 页面保持同一个视觉语义
========================================================= */

const CATEGORY_INFO: Record<
  Category,
  {
    label: string;

    card: string;

    badge: string;

    drop: string;
  }
> = {
  /*
   * 工作
   * 淡蓝
   */
  work: {
    label: "工作",

    card:
      "border-mist-100 bg-mist-50",

    badge:
      "bg-mist-100 text-mist-500",

    drop:
      "border-mist-100 bg-mist-50/90",
  },

  /*
   * 学习
   * 淡绿
   */
  study: {
    label: "学习",

    card:
      "border-sage-100 bg-sage-50",

    badge:
      "bg-sage-100 text-sage-700",

    drop:
      "border-sage-100 bg-sage-50/90",
  },

  /*
   * 生活
   * 淡暖橙
   */
  life: {
    label: "生活",

    card:
      "border-amber-100 bg-amber-50/70",

    badge:
      "bg-amber-100/80 text-amber-700",

    drop:
      "border-amber-100 bg-amber-50/90",
  },

  /*
   * 休息
   * 淡粉
   */
  rest: {
    label: "休息",

    card:
      "border-blush-100 bg-blush-50",

    badge:
      "bg-blush-100 text-blush-500",

    drop:
      "border-blush-100 bg-blush-50/90",
  },

  /*
   * 其他
   * 淡灰
   */
  other: {
    label: "其他",

    card:
      "border-line bg-black/[0.018]",

    badge:
      "bg-black/[0.04] text-ink-soft",

    drop:
      "border-line bg-black/[0.025]",
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

      drop:
        "border-line bg-sage-50/50",
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
        ? todo.custom_tag.trim()
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
   Slots
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
   Unscheduled draggable task
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

  return (
    <div
      ref={
        setNodeRef
      }
      {...attributes}
      {...listeners}
      style={{
        touchAction:
          "none",

        userSelect:
          "none",

        WebkitUserSelect:
          "none",
      }}
      className={`
        flex
        cursor-grab
        select-none
        items-center
        gap-3
        rounded-2xl
        border
        px-3
        py-3
        transition-[opacity,box-shadow,transform]
        duration-150
        active:cursor-grabbing
        ${category.card}

        ${
          isDragging
            ? "scale-[0.99] opacity-30"
            : "hover:-translate-y-[1px] hover:shadow-soft"
        }
      `}
    >
      <GripVertical className="pointer-events-none h-4 w-4 shrink-0 text-ink-faint/40" />

      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {
              todo.title
            }
          </p>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
          >
            {
              category.label
            }
          </span>
        </div>

        <p className="mt-1 text-[11px] text-ink-faint">
          预计{" "}
          {
            todo.estimated_minutes ??
            30
          }{" "}
          分钟
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Drag overlay
   不再扭曲，只做柔和“抬起”
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
        scale-[1.02]
        items-center
        gap-3
        rounded-2xl
        border
        px-3
        py-3
        shadow-[0_12px_34px_rgba(60,50,40,0.12)]
        ${category.card}
      `}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-ink-faint/40" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {
              todo.title
            }
          </p>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
          >
            {
              category.label
            }
          </span>
        </div>

        <p className="mt-1 text-[11px] text-ink-faint">
          预计{" "}
          {
            todo.estimated_minutes ??
            30
          }{" "}
          分钟
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Droppable 15 min slot
========================================================= */

function DroppableSlot({
  slot,
  activeTodo,
}: {
  slot: TimeSlot;

  activeTodo:
    | CalendarTodo
    | null;
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

        hour:
          slot.hour,

        minute:
          slot.minute,
      },
    });

  const strongLine =
    slot.minute ===
    0;

  const halfLine =
    slot.minute ===
    30;

  const category =
    activeTodo
      ? categoryOf(
          activeTodo
        )
      : null;

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
        transition-colors
        duration-100

        ${
          strongLine
            ? "border-t border-line"
            : halfLine
              ? "border-t border-line/55"
              : "border-t border-line/20"
        }

        ${
          activeTodo
            ? "bg-white/10"
            : ""
        }

        ${
          isOver &&
          category
            ? category.drop
            : ""
        }
      `}
    >
      {isOver &&
        activeTodo && (
          <div className="pointer-events-none absolute inset-x-2 top-1/2 z-30 -translate-y-1/2">
            <div
              className={`
                rounded-xl
                border
                px-3
                py-1
                text-center
                text-[10px]
                font-medium
                shadow-[0_2px_8px_rgba(60,50,40,0.04)]
                ${category?.card}
              `}
            >
              <span className="text-ink-soft">
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
              </span>
            </div>
          </div>
        )}
    </div>
  );
}

/* =========================================================
   Scheduled task
========================================================= */

function ScheduledTask({
  todo,
  justPlaced,
}: {
  todo: CalendarTodo;

  justPlaced:
    boolean;
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
   * 当前 Day Planner
   * 只显示 08:00–24:00。
   */
  if (
    minutesFromStart <
      0 ||
    minutesFromStart >=
      TOTAL_MINUTES
  ) {
    return null;
  }

  /*
   * Calendar 块高度：
   *
   * 优先用 scheduled_end - scheduled_start。
   *
   * 只有 scheduled_end 缺失时，
   * 才 fallback 到 estimated_minutes。
   */
  let scheduledDuration =
    todo.estimated_minutes ??
    30;

  if (
    todo.scheduled_end
  ) {
    const end =
      new Date(
        todo.scheduled_end
      );

    const actualWindow =
      Math.round(
        (
          end.getTime() -
          start.getTime()
        ) /
          60000
      );

    if (
      actualWindow >
      0
    ) {
      scheduledDuration =
        actualWindow;
    }
  }

  const top =
    (
      minutesFromStart /
      60
    ) *
    HOUR_HEIGHT;

  /*
   * 最低高度 36px，
   * 防止 15 分钟任务完全看不见。
   */
  const height =
    Math.max(
      36,

      (
        scheduledDuration /
        60
      ) *
        HOUR_HEIGHT
    );

  /*
   * 根据高度决定显示多少信息。
   */
  const compact =
    height < 58;

  const roomy =
    height >= 78;

  return (
    <div
      className={`
        absolute
        left-2
        right-2
        z-20
        overflow-hidden
        rounded-2xl
        border
        px-3
        shadow-[0_3px_14px_rgba(60,50,40,0.045)]
        transition-[transform,box-shadow]
        duration-200
        hover:shadow-soft
        ${category.card}

        ${
          compact
            ? "py-1.5"
            : "py-2"
        }

        ${
          justPlaced
            ? "scale-[1.018]"
            : "scale-100"
        }
      `}
      style={{
        top,
        height,
      }}
    >
      {compact ? (
        /*
         * 很短的任务
         * 一行显示
         */
        <div className="flex h-full items-center justify-between gap-2">
          <p className="truncate text-xs font-medium text-ink">
            {
              todo.title
            }
          </p>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] ${category.badge}`}
          >
            {
              category.label
            }
          </span>
        </div>
      ) : (
        /*
         * 正常 / 较长任务
         */
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-ink">
              {
                todo.title
              }
            </p>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
            >
              {
                category.label
              }
            </span>
          </div>

          <p className="mt-1 text-[11px] text-ink-faint">
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

          {roomy &&
            todo.estimated_minutes && (
              <p className="mt-1 text-[10px] text-ink-faint/85">
                预计实际工作{" "}
                {
                  todo.estimated_minutes
                }{" "}
                分钟
              </p>
            )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Main
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
    justPlacedId,
    setJustPlacedId,
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
   * Desktop：
   * 移动 4 px 后启动。
   *
   * Mobile：
   * 长按约 150 ms。
   */
  const sensors =
    useSensors(
      useSensor(
        MouseSensor,
        {
          activationConstraint:
            {
              distance: 4,
            },
        }
      ),

      useSensor(
        TouchSensor,
        {
          activationConstraint:
            {
              delay: 150,

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

    setError(
      null
    );
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

    /*
     * 未排期拖进 Calendar 时，
     *
     * 第一版：
     * scheduled window 默认使用 estimated_minutes。
     *
     * 之后我们可以加 resize，
     * 让用户自己拉长 Calendar 时间块。
     */
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

    const previousTodos =
      todos;

    /*
     * Optimistic UI
     *
     * 松手就立即显示，
     * 不等 Supabase。
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

    /*
     * 一个很轻的吸附反馈。
     */
    setJustPlacedId(
      todoId
    );

    window.setTimeout(
      () => {
        setJustPlacedId(
          (
            current
          ) =>
            current ===
            todoId
              ? null
              : current
        );
      },
      220
    );

    setSavingTodoId(
      todoId
    );

    setError(
      null
    );

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
              把任务轻轻放进今天的时间里。
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
                  按住任务，拖到右边安排时间
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
                    找到合适的时间，松手就好
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

              {/* Time grid */}
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
                      activeTodo={
                        activeTodo
                      }
                    />
                  )
                )}

                {/* Scheduled tasks */}
                <div className="pointer-events-none absolute inset-0">
                  {scheduledTodos.map(
                    (
                      todo
                    ) => (
                      <ScheduledTask
                        key={
                          todo.id
                        }
                        todo={
                          todo
                        }
                        justPlaced={
                          justPlacedId ===
                          todo.id
                        }
                      />
                    )
                  )}
                </div>
              </div>
            </div>

            {savingTodoId && (
              <div className="border-t border-line bg-paper/60 px-5 py-2 text-right text-[10px] text-ink-faint">
                正在保存排期…
              </div>
            )}
          </section>
        </div>
      </div>

      {/* =====================================================
          Drag overlay
      ====================================================== */}

      <DragOverlay
        dropAnimation={{
          duration:
            180,

          easing:
            "cubic-bezier(0.22, 0.8, 0.3, 1)",
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
