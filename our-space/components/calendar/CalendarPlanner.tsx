"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripHorizontal,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Save,
  X,
} from "lucide-react";

import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
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
  type CollisionDetection,
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

type TodoSession = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
};

type CalendarTodo = {
  id: string;
  title: string;
  description: string | null;
  estimated_minutes: number | null;
  status: string;
  group_id: string | null;
  task_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  category: Category | null;
  custom_tag: string | null;
  started_at: string | null;
  elapsed_seconds: number | null;

  /*
   * 一个 Todo 可以对应多个 Calendar Session。
   * 当前主要用于计算已安排时间 / 剩余时间和任务池视觉进度。
   */
  todo_sessions: TodoSession[];
};

type Props = {
  initialTodos: CalendarTodo[];
  initialDate: string;
};

/* =========================================================
   Calendar layout
========================================================= */

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 24;

const HOUR_HEIGHT = 96;

const SLOT_MINUTES = 15;

const TIMELINE_BOTTOM_SPACE = 32;

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
   Categories
========================================================= */

const CATEGORY_INFO: Record<
  Category,
  {
    label: string;
    card: string;
    badge: string;
    selected: string;
    drop: string;
  }
> = {
  work: {
    label: "工作",

    card:
      "border-mist-100 bg-mist-50",

    badge:
      "bg-mist-100 text-mist-500",

    selected:
      "border-mist-500 bg-mist-100 text-mist-500",

    drop:
      "bg-mist-50",
  },

  study: {
    label: "学习",

    card:
      "border-sage-100 bg-sage-50",

    badge:
      "bg-sage-100 text-sage-700",

    selected:
      "border-sage-500 bg-sage-100 text-sage-700",

    drop:
      "bg-sage-50",
  },

  life: {
    label: "生活",

    card:
      "border-amber-100 bg-amber-50/70",

    badge:
      "bg-amber-50 text-amber-700",

    selected:
      "border-amber-300 bg-amber-50 text-amber-700",

    drop:
      "bg-amber-50",
  },

  rest: {
    label: "休息",

    card:
      "border-blush-100 bg-blush-50",

    badge:
      "bg-blush-100 text-blush-500",

    selected:
      "border-blush-500 bg-blush-100 text-blush-500",

    drop:
      "bg-blush-50",
  },

  other: {
    label: "其他",

    card:
      "border-line bg-black/[0.018]",

    badge:
      "bg-black/[0.04] text-ink-soft",

    selected:
      "border-ink-faint bg-black/[0.04] text-ink-soft",

    drop:
      "bg-black/[0.025]",
  },
};

/**
 * 返回 Todo 对应的分类视觉配置。
 * 对于 other 分类，如果存在 custom_tag，则优先显示自定义标签。
 */
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

      selected:
        "border-line bg-white text-ink-soft",

      drop:
        "bg-sage-50/50",
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

/**
 * 在 YYYY-MM-DD 日期字符串上增加或减少天数。
 * 使用本地 Date 构造，避免 UTC 解析造成日期偏移。
 */
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

/**
 * 将 YYYY-MM-DD 格式化为 Calendar 顶部显示的中文日期标题。
 */
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

  return new Intl.DateTimeFormat(
    "zh-CN",
    {
      month: "long",
      day: "numeric",
      weekday: "long",
    }
  ).format(
    new Date(
      year,
      month - 1,
      day
    )
  );
}

/**
 * 从 ISO 时间中提取用户本地时区对应的 YYYY-MM-DD。
 */
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

/**
 * 将 ISO 时间格式化为 24 小时制 HH:mm。
 */
function formatTime(
  iso: string
) {
  return new Date(
    iso
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
}

/**
 * 根据本地日期、小时和分钟创建 Date。
 * Calendar 拖拽落点会通过它转换成真实时间。
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

/**
 * 将 ISO 时间转换成 datetime-local 输入框需要的本地值。
 */
function toLocalInputValue(
  iso:
    | string
    | null
) {
  if (!iso) {
    return "";
  }

  const date =
    new Date(iso);

  const offset =
    date.getTimezoneOffset() *
    60000;

  return new Date(
    date.getTime() -
      offset
  )
    .toISOString()
    .slice(
      0,
      16
    );
}

/**
 * 返回旧版 Todo 排期的时长（分钟）。
 *
 * 迁移期仍保留 scheduled_start / scheduled_end，
 * 因此旧 Calendar 时间块继续通过这个函数计算持续时间。
 * 如果没有有效排期，则退回 estimated_minutes，最后默认 30 分钟。
 */
function durationMinutes(
  todo: CalendarTodo
) {
  if (
    todo.scheduled_start &&
    todo.scheduled_end
  ) {
    const result =
      Math.round(
        (
          new Date(
            todo.scheduled_end
          ).getTime() -
          new Date(
            todo.scheduled_start
          ).getTime()
        ) /
          60000
      );

    if (result > 0) {
      return result;
    }
  }

  return (
    todo.estimated_minutes ??
    30
  );
}

/**
 * 计算单个 todo_session 的计划时长（分钟）。
 *
 * 这里只计算排期长度，不表示任务已经完成了多少。
 */
function sessionDurationMinutes(
  session: TodoSession
) {
  const start = new Date(
    session.scheduled_start
  ).getTime();

  const end = new Date(
    session.scheduled_end
  ).getTime();

  return Math.max(
    0,
    Math.round(
      (end - start) / 60000
    )
  );
}

/**
 * 汇总一个 Todo 的所有 Session，计算已经安排进 Calendar 的总分钟数。
 *
 * 注意：scheduledMinutes 表示“已排期时间”，不是“已完成时间”。
 */
function scheduledMinutes(
  todo: CalendarTodo
) {
  return (
    todo.todo_sessions ?? []
  ).reduce(
    (total, session) =>
      total +
      sessionDurationMinutes(
        session
      ),
    0
  );
}

/**
 * 计算 Todo 尚未安排的预计时间。
 *
 * remaining = estimated_minutes - scheduledMinutes(todo)
 * 没有 estimated_minutes 时返回 null；已排满或超排时最低显示 0。
 */
function remainingMinutes(
  todo: CalendarTodo
) {
  if (!todo.estimated_minutes) {
    return null;
  }

  return Math.max(
    0,
    todo.estimated_minutes -
      scheduledMinutes(todo)
  );
}

/**
 * 返回任务的排期比例，范围固定在 0~1。
 *
 * 该比例用于任务池卡片背景的深浅填充：
 * 深色部分 = 已安排时间；浅色部分 = 尚未安排时间。
 * 它不是任务完成度。
 */
function scheduledRatio(
  todo: CalendarTodo
) {
  if (
    !todo.estimated_minutes ||
    todo.estimated_minutes <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    scheduledMinutes(todo) /
      todo.estimated_minutes
  );
}

/**
 * 将分钟数格式化为紧凑的可读文本。
 *
 * 例：30 -> "30m"；90 -> "1h 30m"；120 -> "2h"。
 */
function formatMinutes(
  minutes: number
) {
  const hours =
    Math.floor(minutes / 60);

  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${mins}m`;
}

/**
 * 将任意分钟数吸附到 SLOT_MINUTES 的固定时间粒度。
 * 当前为 15 分钟，用于拖拽和 resize 对齐。
 */
function snapMinutes(
  minutes: number
) {
  return (
    Math.round(
      minutes /
        SLOT_MINUTES
    ) *
    SLOT_MINUTES
  );
}

/* =========================================================
   Slot helpers
========================================================= */

type TimeSlot = {
  id: string;

  hour: number;

  minute: number;
};

/**
 * 根据当前日期生成 Calendar 的全部 15 分钟时间槽。
 */
function buildSlots(
  date: string
) {
  const result:
    TimeSlot[] = [];

  for (
    let minuteFromStart = 0;
    minuteFromStart <
    TOTAL_MINUTES;
    minuteFromStart +=
      SLOT_MINUTES
  ) {
    const absolute =
      DAY_START_HOUR *
        60 +
      minuteFromStart;

    const hour =
      Math.floor(
        absolute / 60
      );

    const minute =
      absolute % 60;

    result.push({
      id:
        `slot:${date}:${hour}:${minute}`,

      hour,

      minute,
    });
  }

  return result;
}

/**
 * 解析 CalendarSlot 的 droppable id。
 * 非法或非 slot id 会返回 null。
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
    raw.lastIndexOf(":");

  const secondLastColon =
    raw.lastIndexOf(
      ":",
      lastColon - 1
    );

  if (
    lastColon < 0 ||
    secondLastColon < 0
  ) {
    return null;
  }

  return {
    date:
      raw.slice(
        0,
        secondLastColon
      ),

    hour:
      Number(
        raw.slice(
          secondLastColon +
            1,
          lastColon
        )
      ),

    minute:
      Number(
        raw.slice(
          lastColon + 1
        )
      ),
  };
}

/**
 * 判断两个 ISO 时间区间是否真正重叠。
 * 相邻但首尾相接的区间不视为冲突。
 */
function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  const a1 =
    new Date(
      startA
    ).getTime();

  const a2 =
    new Date(
      endA
    ).getTime();

  const b1 =
    new Date(
      startB
    ).getTime();

  const b2 =
    new Date(
      endB
    ).getTime();

  return (
    a1 < b2 &&
    a2 > b1
  );
}

/* =========================================================
   Unscheduled task
========================================================= */

/**
 * 任务池中的可拖拽任务卡。
 *
 * 卡片本身就是排期进度可视化：
 * - 左侧较深区域：已经安排到 Calendar 的时间；
 * - 右侧较浅区域：尚未安排的预计时间。
 *
 * 同时保留“已安排 / 剩余”的数字文本，避免只靠颜色表达信息。
 */
function PoolTask({
  todo,
}: {
  todo: CalendarTodo;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `todo:${todo.id}`,
  });

  const category =
    categoryOf(todo);

  const scheduled =
    scheduledMinutes(todo);

  const remaining =
    remainingMinutes(todo);

  const progress =
    scheduledRatio(todo) * 100;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        touchAction: "none",
        userSelect: "none",

        /*
         * 用整张卡片的背景填充表示排期比例，
         * 不再额外增加独立 progress bar，降低任务池视觉噪音。
         */
        background: `
          linear-gradient(
            to right,
            rgba(147, 169, 142, 0.26) 0%,
            rgba(147, 169, 142, 0.26) ${progress}%,
            rgba(251, 247, 241, 0.72) ${progress}%,
            rgba(251, 247, 241, 0.72) 100%
          )
        `,
      }}
      className={`
        flex
        cursor-grab
        items-center
        gap-3
        rounded-2xl
        border
        border-line
        px-3
        py-3
        transition
        active:cursor-grabbing

        ${
          isDragging
            ? "scale-[0.99] opacity-25"
            : "hover:-translate-y-[1px] hover:shadow-soft"
        }
      `}
    >
      <GripVertical className="pointer-events-none h-4 w-4 shrink-0 text-ink-faint/40" />

      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {todo.title}
          </p>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
          >
            {category.label}
          </span>
        </div>

        <p className="mt-1 text-[11px] text-ink-faint">
          已安排{" "}
          {formatMinutes(scheduled)}

          {remaining !== null && (
            <>
              {" · "}
              剩余{" "}
              {formatMinutes(
                remaining
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Drag overlay
========================================================= */

/**
 * 拖拽过程中跟随指针显示的任务预览。
 * 仅提供视觉反馈，不写入数据库。
 */
function DragPreview({
  todo,
}: {
  todo: CalendarTodo;
}) {
  const category =
    categoryOf(todo);

  return (
    <div
      className={`
        w-[280px]
        scale-[1.02]
        rounded-2xl
        border
        px-3
        py-3
        shadow-[0_14px_36px_rgba(60,50,40,0.12)]
        ${category.card}
      `}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-ink">
          {
            todo.title
          }
        </p>

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
        >
          {
            category.label
          }
        </span>
      </div>

      <p className="mt-1 text-[11px] text-ink-faint">
        {
          todo.scheduled_start
            ? `${formatTime(
                todo.scheduled_start
              )}${
                todo.scheduled_end
                  ? ` – ${formatTime(
                      todo.scheduled_end
                    )}`
                  : ""
              }`
            : `预计 ${
                todo.estimated_minutes ??
                30
              } 分钟`
        }
      </p>
    </div>
  );
}

/* =========================================================
   Calendar slot
========================================================= */

/**
 * 单个 Calendar 时间槽。
 * 同时作为 dnd-kit droppable，接收任务拖入并显示落点反馈。
 */
function CalendarSlot({
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
    });

  const category =
    activeTodo
      ? categoryOf(
          activeTodo
        )
      : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        height:
          SLOT_HEIGHT,
      }}
      className={`
        relative
        transition-colors

        ${
          slot.minute === 0
            ? "border-t border-line"
            : slot.minute ===
                30
              ? "border-t border-line/55"
              : "border-t border-line/20"
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
          <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2">
            <div
              className={`rounded-xl border px-3 py-1 text-center text-[10px] shadow-sm ${category?.card}`}
            >
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
            </div>
          </div>
        )}
    </div>
  );
}

/* =========================================================
   Scheduled task
========================================================= */

/**
 * Calendar 中的旧版 Todo 时间块。
 * 当前仍读取 todo.scheduled_start / scheduled_end，以保证迁移期兼容。
 */
function ScheduledTask({
  todo,
  selected,
  justPlaced,
  onSelect,
  onResize,
}: {
  todo: CalendarTodo;

  selected:
    boolean;

  justPlaced:
    boolean;

  onSelect:
    () => void;

  onResize:
    (
      todo: CalendarTodo,
      newEnd: string
    ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef:
      setDragRef,
    isDragging,
  } =
    useDraggable({
      id:
        `todo:${todo.id}`,
    });

  const {
    setNodeRef:
      setDropRef,
    isOver,
  } =
    useDroppable({
      id:
        `task:${todo.id}`,
    });

  const [
    previewEnd,
    setPreviewEnd,
  ] =
    useState<
      string | null
    >(
      null
    );

  if (
    !todo.scheduled_start
  ) {
    return null;
  }

  /*
   * 当前任务的分类视觉配置。
   * Calendar 中任务块的背景、边框和标签都由这里决定。
   */
  const category =
    categoryOf(todo);

  const start =
    new Date(
      todo.scheduled_start
    );

  const startMinute =
    start.getHours() *
      60 +
    start.getMinutes();

  const minuteFromStart =
    startMinute -
    DAY_START_HOUR *
      60;

  if (
    minuteFromStart <
      0 ||
    minuteFromStart >=
      TOTAL_MINUTES
  ) {
    return null;
  }

  const effectiveEnd =
    previewEnd ??
    todo.scheduled_end;

  let duration =
    todo.estimated_minutes ??
    30;

  if (effectiveEnd) {
    const calculated =
      Math.round(
        (
          new Date(
            effectiveEnd
          ).getTime() -
          start.getTime()
        ) /
          60000
      );

    if (
      calculated > 0
    ) {
      duration =
        calculated;
    }
  }

  const top =
    (
      minuteFromStart /
      60
    ) *
    HOUR_HEIGHT;

  const rawHeight =
    (
      duration /
      60
    ) *
    HOUR_HEIGHT;

  const height =
    Math.max(
      36,
      rawHeight
    );

  const compact =
    height < 60;

  /**
   * 开始调整时间块高度。
   * Pointer Move 只更新预览，Pointer Up 才把最终结束时间交给 onResize 保存。
   */
  function beginResize(
    event:
      ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startY =
      event.clientY;

    const originalDuration =
      duration;

    const pointerId =
      event.pointerId;

    event.currentTarget.setPointerCapture(
      pointerId
    );

    const move = (
      moveEvent:
        PointerEvent
    ) => {
      const deltaY =
        moveEvent.clientY -
        startY;

      const deltaMinutes =
        snapMinutes(
          (
            deltaY /
            HOUR_HEIGHT
          ) *
            60
        );

      const newDuration =
        Math.max(
          15,
          originalDuration +
            deltaMinutes
        );

      const newEnd =
        new Date(
          start.getTime() +
            newDuration *
              60000
        );

      setPreviewEnd(
        newEnd.toISOString()
      );
    };

    const finish = (
      upEvent:
        PointerEvent
    ) => {
      document.removeEventListener(
        "pointermove",
        move
      );

      document.removeEventListener(
        "pointerup",
        finish
      );

      const deltaY =
        upEvent.clientY -
        startY;

      const deltaMinutes =
        snapMinutes(
          (
            deltaY /
            HOUR_HEIGHT
          ) *
            60
        );

      const newDuration =
        Math.max(
          15,
          originalDuration +
            deltaMinutes
        );

      const newEnd =
        new Date(
          start.getTime() +
            newDuration *
              60000
        ).toISOString();

      setPreviewEnd(
        null
      );

      onResize(
        todo,
        newEnd
      );
    };

    document.addEventListener(
      "pointermove",
      move
    );

    document.addEventListener(
      "pointerup",
      finish
    );
  }

  return (
    <div
      ref={(
        node
      ) => {
        setDragRef(
          node
        );

        setDropRef(
          node
        );
      }}
      className={`
        absolute
        left-2
        right-2
        z-20
        rounded-2xl
        border
        shadow-[0_3px_14px_rgba(60,50,40,0.045)]
        transition-[transform,box-shadow,opacity]
        duration-150
        ${category.card}

        ${
          selected
            ? "ring-2 ring-sage-300/40"
            : ""
        }

        ${
          isOver
            ? "ring-2 ring-sage-300/80"
            : ""
        }

        ${
          isDragging
            ? "opacity-25"
            : ""
        }

        ${
          justPlaced
            ? "scale-[1.018]"
            : ""
        }
      `}
      style={{
        top,
        height,
      }}
      onClick={
        onSelect
      }
    >
      <div
        className={`relative h-full ${
          compact
            ? "px-3 py-1.5"
            : "px-3 py-2"
        }`}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
            style={{
              touchAction:
                "none",
   
            }}
            className="mt-0.5 shrink-0 cursor-grab rounded-md p-0.5 text-ink-faint/40 hover:bg-black/[0.03] active:cursor-grabbing"
            title="拖动任务"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`truncate font-medium text-ink ${
                  compact
                    ? "text-xs"
                    : "text-sm"
                }`}
              >
                {
                  todo.title
                }
              </p>

              <span
                className={`shrink-0 rounded-full px-2 py-0.5 ${
                  compact
                    ? "text-[9px]"
                    : "text-[10px]"
                } ${category.badge}`}
              >
                {
                  category.label
                }
              </span>
            </div>

            {!compact && (
              <p className="mt-1 text-[11px] text-ink-faint">
                {
                  formatTime(
                    todo.scheduled_start
                  )
                }

                {" – "}

                {
                  effectiveEnd
                    ? formatTime(
                        effectiveEnd
                      )
                    : ""
                }
              </p>
            )}

            {height >=
              88 &&
              todo.estimated_minutes && (
                <p className="mt-1 text-[10px] text-ink-faint/85">
                  预计工作{" "}
                  {
                    todo.estimated_minutes
                  }{" "}
                  分钟
                </p>
              )}
          </div>
        </div>

        {/* Resize handle */}
        {!isDragging && (
          <button
            type="button"
            onPointerDown={
              beginResize
            }
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
            className="absolute bottom-0 left-1/2 flex h-3 w-16 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-t-md text-ink-faint/35 hover:bg-black/[0.035] hover:text-ink-faint"
            title="拖动修改结束时间"
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Main
========================================================= */

/**
 * Calendar 主组件。
 *
 * 负责日期切换、任务池、拖拽排期、时间块交换/移动、resize、
 * 任务编辑以及进入 Focus。当前处于旧排期字段向 todo_sessions 迁移阶段。
 */
export default function CalendarPlanner({
  initialTodos,
  initialDate,
}: Props) {
  const router =
    useRouter();

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
    selectedTodoId,
    setSelectedTodoId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    editingTodoId,
    setEditingTodoId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    busyId,
    setBusyId,
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

  /* Edit form */

  const [
    editTitle,
    setEditTitle,
  ] =
    useState("");

  const [
    editMinutes,
    setEditMinutes,
  ] =
    useState("");

  const [
    editCategory,
    setEditCategory,
  ] =
    useState<
      Category | null
    >(
      null
    );

  const [
    editCustomTag,
    setEditCustomTag,
  ] =
    useState("");

  const [
    editStart,
    setEditStart,
  ] =
    useState("");

  const [
    editEnd,
    setEditEnd,
  ] =
    useState("");

  const sensors =
    useSensors(
      useSensor(
        MouseSensor,
        {
          activationConstraint:
            {
              distance:
                4,
            },
        }
      ),

      useSensor(
        TouchSensor,
        {
          activationConstraint:
            {
              delay:
                150,

              tolerance:
                8,
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
          (
            todo
          ) =>
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
            (
              todo
            ) =>
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
    todos.find(
      (
        todo
      ) =>
        todo.id ===
        activeTodoId
    ) ??
    null;

  const selectedTodo =
    todos.find(
      (
        todo
      ) =>
        todo.id ===
        selectedTodoId
    ) ??
    null;

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

  /*
   * 如果鼠标同时位于 task 和 slot，
   * 优先把 task 当作目标。
   *
   * 这样 A 拖到 B 才会触发交换。
   */
  const collisionDetection:
    CollisionDetection =
    (
      args
    ) => {
      const collisions =
        pointerWithin(
          args
        );

      const task =
        collisions.find(
          (
            collision
          ) =>
            String(
              collision.id
            ).startsWith(
              "task:"
            )
        );

      if (task) {
        return [
          task,
        ];
      }

      return collisions;
    };

  /**
   * 短暂标记刚刚放入 Calendar 的任务，用于播放轻量视觉反馈。
   */
  function flashPlaced(
    id: string
  ) {
    setJustPlacedId(
      id
    );

    window.setTimeout(
      () => {
        setJustPlacedId(
          (
            current
          ) =>
            current ===
            id
              ? null
              : current
        );
      },
      220
    );
  }

  /* =======================================================
     Drag start
  ======================================================= */

  /**
   * 处理拖拽开始：记录当前 Todo，供 DragOverlay 和落点预览使用。
   */
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

    setSelectedTodoId(
      null
    );

    setEditingTodoId(
      null
    );

    setError(
      null
    );
  }

  /* =======================================================
     Drag end
  ======================================================= */

  /**
   * 处理拖拽结束。
   *
   * 当前仍维护旧版 scheduled_start / scheduled_end：
   * - 拖到空时间槽：首次安排或移动任务；
   * - 拖到另一任务：交换 / 替换时间段。
   *
   * todo_sessions 完全接管 Calendar 后，这里会改为创建或移动 Session。
   */
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
      activeId.slice(5);

    const source =
      todos.find(
        (
          todo
        ) =>
          todo.id ===
          todoId
      );

    if (!source) {
      return;
    }

    /* =====================================================
       Drop onto another task
       = swap / replace
    ===================================================== */

    if (
      overId.startsWith(
        "task:"
      )
    ) {
      const targetId =
        overId.slice(5);

      if (
        targetId ===
        todoId
      ) {
        return;
      }

      const target =
        todos.find(
          (
            todo
          ) =>
            todo.id ===
            targetId
        );

      if (
        !target ||
        !target.scheduled_start
      ) {
        return;
      }

      const previous =
        todos;

      /*
       * Optimistic update
       */
      if (
        source.scheduled_start
      ) {
        /*
         * 已排期 A → B
         * 两边交换。
         */
        setTodos(
          (
            current
          ) =>
            current.map(
              (
                item
              ) => {
                if (
                  item.id ===
                  source.id
                ) {
                  return {
                    ...item,

                    scheduled_start:
                      target.scheduled_start,

                    scheduled_end:
                      target.scheduled_end,

                    task_date:
                      target.task_date,
                  };
                }

                if (
                  item.id ===
                  target.id
                ) {
                  return {
                    ...item,

                    scheduled_start:
                      source.scheduled_start,

                    scheduled_end:
                      source.scheduled_end,

                    task_date:
                      source.task_date,
                  };
                }

                return item;
              }
            )
        );
      } else {
        /*
         * 未排期 A → B
         *
         * A 占据 B 的位置，
         * B 回任务池。
         */
        setTodos(
          (
            current
          ) =>
            current.map(
              (
                item
              ) => {
                if (
                  item.id ===
                  source.id
                ) {
                  return {
                    ...item,

                    scheduled_start:
                      target.scheduled_start,

                    scheduled_end:
                      target.scheduled_end,

                    task_date:
                      target.task_date,
                  };
                }

                if (
                  item.id ===
                  target.id
                ) {
                  return {
                    ...item,

                    scheduled_start:
                      null,

                    scheduled_end:
                      null,
                  };
                }

                return item;
              }
            )
        );
      }

      flashPlaced(
        source.id
      );

      setBusyId(
        source.id
      );

      const supabase =
        createClient();

      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "swap_or_replace_todo_schedules",
          {
            source_todo_id:
              source.id,

            target_todo_id:
              target.id,
          }
        );

      setBusyId(
        null
      );

      if (
        rpcError
      ) {
        setTodos(
          previous
        );

        setError(
          "交换时间失败：" +
            rpcError.message
        );
      }

      return;
    }

    /* =====================================================
       Drop onto empty slot
    ===================================================== */

    const slot =
      readSlotId(
        overId
      );

    if (!slot) {
      return;
    }

    /*
     * 已排期任务移动时：
     * 保留原 schedule window 长度。
     *
     * 未排期：
     * 用 estimated_minutes。
     */
    const duration =
      source.scheduled_start
        ? durationMinutes(
            source
          )
        : source.estimated_minutes ??
          30;

    const start =
      makeLocalDate(
        slot.date,
        slot.hour,
        slot.minute
      );

    const end =
      new Date(
        start.getTime() +
          duration *
            60000
      );

    const startIso =
      start.toISOString();

    const endIso =
      end.toISOString();

    /*
     * 如果与别的任务真正重叠，
     * 先不猜用户想做什么。
     *
     * 要交换就直接拖到任务本身。
     */
    const conflict =
      todos.find(
        (
          other
        ) =>
          other.id !==
            source.id &&
          other.scheduled_start &&
          other.scheduled_end &&
          overlaps(
            startIso,
            endIso,
            other.scheduled_start,
            other.scheduled_end
          )
      );

    if (conflict) {
      setError(
        `这个时间段和「${conflict.title}」重叠。想交换的话，把任务直接拖到它上面。`
      );

      return;
    }

    const previous =
      todos;

    setTodos(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            source.id
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

    flashPlaced(
      source.id
    );

    setBusyId(
      source.id
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
          source.id
        );

    setBusyId(
      null
    );

    if (
      updateError
    ) {
      setTodos(
        previous
      );

      setError(
        "保存排期失败：" +
          updateError.message
      );
    }
  }

  /* =======================================================
     Resize schedule window
  ======================================================= */

  /**
   * 保存 resize 后的新结束时间。
   * 保存前会检查时间范围和与其他任务的冲突。
   */
  async function handleResize(
    todo:
      CalendarTodo,

    newEnd:
      string
  ) {
    if (
      !todo.scheduled_start
    ) {
      return;
    }

    const conflict =
      todos.find(
        (
          other
        ) =>
          other.id !==
            todo.id &&
          other.scheduled_start &&
          other.scheduled_end &&
          overlaps(
            todo.scheduled_start!,
            newEnd,
            other.scheduled_start,
            other.scheduled_end
          )
      );

    if (
      conflict
    ) {
      setError(
        `拉长后会和「${conflict.title}」重叠，所以没有保存。`
      );

      return;
    }

    const previous =
      todos;

    setTodos(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            todo.id
              ? {
                  ...item,

                  scheduled_end:
                    newEnd,
                }
              : item
        )
    );

    setBusyId(
      todo.id
    );

    const supabase =
      createClient();

    const {
      error:
        resizeError,
    } =
      await supabase
        .from(
          "todos"
        )
        .update({
          scheduled_end:
            newEnd,
        })
        .eq(
          "id",
          todo.id
        );

    setBusyId(
      null
    );

    if (
      resizeError
    ) {
      setTodos(
        previous
      );

      setError(
        "修改时间长度失败：" +
          resizeError.message
      );
    }
  }

  /* =======================================================
     Edit
  ======================================================= */

  /**
   * 打开任务编辑面板，并把 Todo 当前值同步到编辑 state。
   */
  function startEditing(
    todo:
      CalendarTodo
  ) {
    setEditingTodoId(
      todo.id
    );

    setEditTitle(
      todo.title
    );

    setEditMinutes(
      todo.estimated_minutes
        ? String(
            todo.estimated_minutes
          )
        : ""
    );

    setEditCategory(
      todo.category
    );

    setEditCustomTag(
      todo.custom_tag ??
        ""
    );

    setEditStart(
      toLocalInputValue(
        todo.scheduled_start
      )
    );

    setEditEnd(
      toLocalInputValue(
        todo.scheduled_end
      )
    );

    setError(
      null
    );
  }

  /**
   * 关闭任务编辑面板，并清空编辑期间的临时 state。
   */
  function cancelEditing() {
    setEditingTodoId(
      null
    );
  }

  /**
   * 校验并保存任务编辑结果。
   * 当前迁移期仍会写入 Todo 的旧 scheduled_start / scheduled_end。
   */
  async function saveEdit(
    todo:
      CalendarTodo
  ) {
    const title =
      editTitle.trim();

    if (!title) {
      setError(
        "任务名称不能为空。"
      );

      return;
    }

    const minutes =
      editMinutes.trim()
        ? Number(
            editMinutes
          )
        : null;

    if (
      minutes !== null &&
      (
        !Number.isFinite(
          minutes
        ) ||
        minutes <= 0
      )
    ) {
      setError(
        "预计时间需要是大于 0 的分钟数。"
      );

      return;
    }

    if (
      Boolean(
        editStart
      ) !==
      Boolean(
        editEnd
      )
    ) {
      setError(
        "开始时间和结束时间需要一起填写。"
      );

      return;
    }

    let startIso:
      | string
      | null = null;

    let endIso:
      | string
      | null = null;

    if (
      editStart &&
      editEnd
    ) {
      const start =
        new Date(
          editStart
        );

      const end =
        new Date(
          editEnd
        );

      if (
        end <= start
      ) {
        setError(
          "结束时间需要晚于开始时间。"
        );

        return;
      }

      startIso =
        start.toISOString();

      endIso =
        end.toISOString();
    }

    const previous =
      todos;

    const updated:
      CalendarTodo = {
      ...todo,

      title,

      estimated_minutes:
        minutes,

      category:
        editCategory,

      custom_tag:
        editCategory ===
          "other" &&
        editCustomTag.trim()
          ? editCustomTag.trim()
          : null,

      scheduled_start:
        startIso,

      scheduled_end:
        endIso,

      task_date:
        editStart
          ? editStart.slice(
              0,
              10
            )
          : todo.task_date,
    };

    /*
     * 编辑产生的新时间段也检查冲突。
     */
    if (
      startIso &&
      endIso
    ) {
      const conflict =
        todos.find(
          (
            other
          ) =>
            other.id !==
              todo.id &&
            other.scheduled_start &&
            other.scheduled_end &&
            overlaps(
              startIso!,
              endIso!,
              other.scheduled_start,
              other.scheduled_end
            )
        );

      if (
        conflict
      ) {
        setError(
          `这个时间段和「${conflict.title}」重叠。`
        );

        return;
      }
    }

    setTodos(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            todo.id
              ? updated
              : item
        )
    );

    setBusyId(
      todo.id
    );

    const supabase =
      createClient();

    const {
      error:
        saveError,
    } =
      await supabase
        .from(
          "todos"
        )
        .update({
          title,

          estimated_minutes:
            minutes,

          category:
            editCategory,

          custom_tag:
            updated.custom_tag,

          scheduled_start:
            startIso,

          scheduled_end:
            endIso,

          task_date:
            updated.task_date,
        })
        .eq(
          "id",
          todo.id
        );

    setBusyId(
      null
    );

    if (
      saveError
    ) {
      setTodos(
        previous
      );

      setError(
        "保存修改失败：" +
          saveError.message
      );

      return;
    }

    setEditingTodoId(
      null
    );
  }

  /* =======================================================
     Complete
  ======================================================= */

  /**
   * 将 Todo 标记为已完成，并清理任务的运行中计时状态。
   */
  async function completeTodo(
    todo:
      CalendarTodo
  ) {
    const previous =
      todos;

    let elapsed =
      todo.elapsed_seconds ??
      0;

    if (
      todo.status ===
        "running" &&
      todo.started_at
    ) {
      elapsed +=
        Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              new Date(
                todo.started_at
              ).getTime()
            ) /
              1000
          )
        );
    }

    setTodos(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            todo.id
        )
    );

    setSelectedTodoId(
      null
    );

    const supabase =
      createClient();

    const {
      error:
        completeError,
    } =
      await supabase
        .from(
          "todos"
        )
        .update({
          status:
            "completed",

          started_at:
            null,

          elapsed_seconds:
            elapsed,

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          todo.id
        );

    if (
      completeError
    ) {
      setTodos(
        previous
      );

      setError(
        "完成任务失败：" +
          completeError.message
      );
    }
  }

  /* =======================================================
     Focus
  ======================================================= */

  /**
   * 进入指定 Todo 的 Focus 页面。这里只负责导航，不在 Calendar 内启动计时。
   */
  async function openFocus(
    todo:
      CalendarTodo
  ) {
    /*
     * Calendar 是计划，
     * Focus 是实际。
     *
     * 所以提前开始绝不修改：
     * scheduled_start / scheduled_end。
     */

    const running =
      todos.find(
        (
          item
        ) =>
          item.status ===
            "running" &&
          item.id !==
            todo.id
      );

    if (
      running
    ) {
      const shouldSwitch =
        window.confirm(
          `「${running.title}」还在计时。\n\n要暂停它并开始「${todo.title}」吗？`
        );

      if (
        !shouldSwitch
      ) {
        return;
      }

      let elapsed =
        running.elapsed_seconds ??
        0;

      if (
        running.started_at
      ) {
        elapsed +=
          Math.max(
            0,
            Math.floor(
              (
                Date.now() -
                new Date(
                  running.started_at
                ).getTime()
              ) /
                1000
            )
          );
      }

      const supabase =
        createClient();

      const {
        error:
          pauseError,
      } =
        await supabase
          .from(
            "todos"
          )
          .update({
            status:
              "paused",

            started_at:
              null,

            elapsed_seconds:
              elapsed,
          })
          .eq(
            "id",
            running.id
          );

      if (
        pauseError
      ) {
        setError(
          "暂停当前 Focus 失败：" +
            pauseError.message
        );

        return;
      }

      setTodos(
        (
          current
        ) =>
          current.map(
            (
              item
            ) =>
              item.id ===
              running.id
                ? {
                    ...item,

                    status:
                      "paused",

                    started_at:
                      null,

                    elapsed_seconds:
                      elapsed,
                  }
                : item
          )
      );
    }

    router.push(
      `/focus/${todo.id}`
    );
  }

  return (
    <DndContext
      sensors={
        sensors
      }
      collisionDetection={
        collisionDetection
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
        {/* =================================================
            Header
        ================================================= */}

        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              日历
            </h1>

            <p className="mt-1 text-sm text-ink-faint">
              安排时间，也给计划留一点调整的余地。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => {
                setSelectedDate(
                  addDays(
                    selectedDate,
                    -1
                  )
                );

                setSelectedTodoId(
                  null
                );
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-sage-50"
              onClick={() => {
                setSelectedDate(
                  initialDate
                );

                setSelectedTodoId(
                  null
                );
              }}
            >
              今天
            </button>

            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => {
                setSelectedDate(
                  addDays(
                    selectedDate,
                    1
                  )
                );

                setSelectedTodoId(
                  null
                );
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-blush-100 bg-blush-50 px-4 py-3 text-sm text-blush-500">
            <span>
              {
                error
              }
            </span>

            <button
              type="button"
              onClick={() =>
                setError(
                  null
                )
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* =================================================
              Task pool
          ================================================= */}

          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">
                  任务池
                </h2>

                <p className="mt-1 text-xs text-ink-faint">
                  拖到右侧安排时间
                </p>
              </div>

              <Link
                href="/todo"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/50"
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
                  <PoolTask
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
              <div className="flex items-center justify-between gap-3">
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
                    拖到空白处重排，拖到任务上交换
                  </div>
                )}
              </div>
            </div>

            {/* ===============================================
                Quick action / editor
            =============================================== */}

            {selectedTodo &&
              selectedTodo.scheduled_start && (
                <div className="border-b border-line bg-paper/50 px-5 py-4">
                  {editingTodoId ===
                  selectedTodo.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            编辑任务
                          </p>

                          <p className="mt-1 text-xs text-ink-faint">
                            Calendar 时间和预计工作量可以不同。
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            cancelEditing
                          }
                          className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <input
                        value={
                          editTitle
                        }
                        onChange={(
                          event
                        ) =>
                          setEditTitle(
                            event.target.value
                          )
                        }
                        className="input w-full"
                        placeholder="任务名称"
                      />

                      <div className="flex flex-wrap gap-2">
                        {(
                          Object.keys(
                            CATEGORY_INFO
                          ) as Category[]
                        ).map(
                          (
                            category
                          ) => {
                            const info =
                              CATEGORY_INFO[
                                category
                              ];

                            const selected =
                              editCategory ===
                              category;

                            return (
                              <button
                                key={
                                  category
                                }
                                type="button"
                                onClick={() =>
                                  setEditCategory(
                                    category
                                  )
                                }
                                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                  selected
                                    ? info.selected
                                    : "border-line bg-white text-ink-soft"
                                }`}
                              >
                                {
                                  info.label
                                }
                              </button>
                            );
                          }
                        )}
                      </div>

                      {editCategory ===
                        "other" && (
                        <input
                          value={
                            editCustomTag
                          }
                          onChange={(
                            event
                          ) =>
                            setEditCustomTag(
                              event.target.value
                            )
                          }
                          className="input w-full"
                          placeholder="自定义类别"
                        />
                      )}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs text-ink-faint">
                            预计工作分钟
                          </span>

                          <input
                            type="number"
                            min="1"
                            value={
                              editMinutes
                            }
                            onChange={(
                              event
                            ) =>
                              setEditMinutes(
                                event.target.value
                              )
                            }
                            className="input w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs text-ink-faint">
                            计划开始
                          </span>

                          <input
                            type="datetime-local"
                            value={
                              editStart
                            }
                            onChange={(
                              event
                            ) =>
                              setEditStart(
                                event.target.value
                              )
                            }
                            className="input w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs text-ink-faint">
                            计划结束
                          </span>

                          <input
                            type="datetime-local"
                            value={
                              editEnd
                            }
                            onChange={(
                              event
                            ) =>
                              setEditEnd(
                                event.target.value
                              )
                            }
                            className="input w-full"
                          />
                        </label>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={
                            cancelEditing
                          }
                          className="btn-ghost"
                        >
                          取消
                        </button>

                        <button
                          type="button"
                          disabled={
                            busyId ===
                            selectedTodo.id
                          }
                          onClick={() =>
                            saveEdit(
                              selectedTodo
                            )
                          }
                          className="btn-primary flex items-center gap-2"
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {
                              selectedTodo.title
                            }
                          </p>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${categoryOf(
                              selectedTodo
                            ).badge}`}
                          >
                            {
                              categoryOf(
                                selectedTodo
                              ).label
                            }
                          </span>
                        </div>

                        <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
                          <Clock3 className="h-3.5 w-3.5" />

                          {
                            formatTime(
                              selectedTodo.scheduled_start
                            )
                          }

                          {selectedTodo.scheduled_end &&
                            ` – ${formatTime(
                              selectedTodo.scheduled_end
                            )}`}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openFocus(
                              selectedTodo
                            )
                          }
                          className="flex items-center gap-2 rounded-xl bg-sage-100 px-3 py-2 text-sm font-medium text-sage-700 transition hover:bg-sage-300/60"
                        >
                          <Play className="h-4 w-4 fill-current" />

                          {new Date(
                            selectedTodo.scheduled_start
                          ).getTime() >
                          Date.now()
                            ? "提前开始"
                            : "开始专注"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            startEditing(
                              selectedTodo
                            )
                          }
                          className="btn-ghost flex items-center gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            completeTodo(
                              selectedTodo
                            )
                          }
                          className="flex items-center gap-2 rounded-xl bg-blush-50 px-3 py-2 text-sm font-medium text-blush-500 transition hover:bg-blush-100"
                        >
                          <Check className="h-4 w-4" />
                          完成
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTodoId(
                              null
                            )
                          }
                          className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* ===============================================
                Timeline
            =============================================== */}

            <div
              className="relative"
              style={{
                height:
                  TOTAL_HEIGHT,
              }}
            >
              {/* Hour labels */}
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

              <div className="absolute inset-y-0 left-[64px] right-0">
                {/* Slots */}
                {slots.map(
                  (
                    slot
                  ) => (
                    <CalendarSlot
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

                {/* Tasks */}
                <div className="absolute inset-0">
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
                        selected={
                          selectedTodoId ===
                          todo.id
                        }
                        justPlaced={
                          justPlacedId ===
                          todo.id
                        }
                        onSelect={() => {
                          if (
                            !activeTodoId
                          ) {
                            setSelectedTodoId(
                              (
                                current
                              ) =>
                                current ===
                                todo.id
                                  ? null
                                  : todo.id
                            );

                            setEditingTodoId(
                              null
                            );
                          }
                        }}
                        onResize={
                          handleResize
                        }
                      />
                    )
                  )}
                </div>
              </div>
            </div>

            {busyId && (
              <div className="border-t border-line bg-paper/60 px-5 py-2 text-right text-[10px] text-ink-faint">
                正在保存…
              </div>
            )}
          </section>
        </div>
      </div>

      <DragOverlay
        dropAnimation={{
          duration:
            180,

          easing:
            "cubic-bezier(0.22, 0.8, 0.3, 1)",
        }}
      >
        {activeTodo ? (
          <DragPreview
            todo={
              activeTodo
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}