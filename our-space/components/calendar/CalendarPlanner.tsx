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
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
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
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   Types
========================================================= */

type Category = "work" | "study" | "life" | "rest" | "other";

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

  /*
   * 旧版 Calendar 字段暂时保留在类型里，方便迁移期兼容。
   * 新版 Calendar 的排期显示和拖拽不再依赖这两个字段。
   */
  scheduled_start: string | null;
  scheduled_end: string | null;

  category: Category | null;
  custom_tag: string | null;
  started_at: string | null;
  elapsed_seconds: number | null;

  /*
   * 一个 Todo 可以拥有多个 Calendar Session。
   * Calendar v2 的排期、移动、resize 都以这里的数据为准。
   */
  todo_sessions: TodoSession[];
};

type Props = {
  initialTodos: CalendarTodo[];
  initialDate: string;
};

type SessionWithTodo = {
  session: TodoSession;
  todo: CalendarTodo;
};

/* =========================================================
   Calendar layout
========================================================= */

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 96;
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = HOUR_HEIGHT / 4;
const TIMELINE_BOTTOM_SPACE = 32;
const DEFAULT_SESSION_MINUTES = 30;

const TOTAL_MINUTES =
  (DAY_END_HOUR - DAY_START_HOUR) * 60;

const TOTAL_HEIGHT =
  (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

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
    card: "border-mist-100 bg-mist-50",
    badge: "bg-mist-100 text-mist-500",
    selected: "border-mist-500 bg-mist-100 text-mist-500",
    drop: "bg-mist-50",
  },
  study: {
    label: "学习",
    card: "border-sage-100 bg-sage-50",
    badge: "bg-sage-100 text-sage-700",
    selected: "border-sage-500 bg-sage-100 text-sage-700",
    drop: "bg-sage-50",
  },
  life: {
    label: "生活",
    card: "border-amber-100 bg-amber-50/70",
    badge: "bg-amber-50 text-amber-700",
    selected: "border-amber-300 bg-amber-50 text-amber-700",
    drop: "bg-amber-50",
  },
  rest: {
    label: "休息",
    card: "border-blush-100 bg-blush-50",
    badge: "bg-blush-100 text-blush-500",
    selected: "border-blush-500 bg-blush-100 text-blush-500",
    drop: "bg-blush-50",
  },
  other: {
    label: "其他",
    card: "border-line bg-black/[0.018]",
    badge: "bg-black/[0.04] text-ink-soft",
    selected: "border-ink-faint bg-black/[0.04] text-ink-soft",
    drop: "bg-black/[0.025]",
  },
};

/**
 * 返回 Todo 对应的分类视觉配置。
 * other 分类存在 custom_tag 时，优先显示用户自定义标签。
 */
function categoryOf(todo: CalendarTodo) {
  if (!todo.category) {
    return {
      label: "未分类",
      card: "border-line bg-white",
      badge: "bg-black/[0.04] text-ink-faint",
      selected: "border-line bg-white text-ink-soft",
      drop: "bg-sage-50/50",
    };
  }

  const base = CATEGORY_INFO[todo.category];

  return {
    ...base,
    label:
      todo.category === "other" && todo.custom_tag?.trim()
        ? todo.custom_tag.trim()
        : base.label,
  };
}

/* =========================================================
   Date / time helpers
========================================================= */

/**
 * 在 YYYY-MM-DD 日期字符串上增加或减少天数。
 * 使用本地 Date 构造，避免 UTC 解析导致日期偏移。
 */
function addDays(dateString: string, amount: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day + amount);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/**
 * 将 YYYY-MM-DD 格式化为 Calendar 顶部使用的中文日期标题。
 */
function formatDateTitle(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

/**
 * 从 ISO 时间提取用户本地时区下的 YYYY-MM-DD。
 */
function localDatePart(iso: string) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/**
 * 将 ISO 时间格式化为 24 小时制 HH:mm。
 */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 根据本地日期、小时和分钟创建 Date。
 * Calendar drop slot 会通过它转换成真正的时间点。
 */
function makeLocalDate(
  dateString: string,
  hour: number,
  minute: number
) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * 将分钟数格式化成紧凑文本。
 * 例如：30 -> 30m，90 -> 1h 30m，120 -> 2h。
 */
function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
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
 * 将任意分钟数吸附到当前 Calendar 的时间粒度。
 * resize 时使用，当前粒度为 15 分钟。
 */
function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

/* =========================================================
   Session helpers
========================================================= */

/**
 * 计算单个 Session 的计划时长（分钟）。
 * 这是“排进 Calendar 的时长”，不代表实际完成时长。
 */
function sessionDurationMinutes(session: TodoSession) {
  const start = new Date(session.scheduled_start).getTime();
  const end = new Date(session.scheduled_end).getTime();

  return Math.max(0, Math.round((end - start) / 60000));
}

/**
 * 汇总 Todo 的全部 Session，得到总已安排分钟数。
 */
function scheduledMinutes(todo: CalendarTodo) {
  return (todo.todo_sessions ?? []).reduce(
    (total, session) => total + sessionDurationMinutes(session),
    0
  );
}

/**
 * 计算 Todo 尚未排进 Calendar 的预计分钟数。
 * 没有 estimated_minutes 时返回 null；超排时最低为 0。
 */
function remainingMinutes(todo: CalendarTodo) {
  if (!todo.estimated_minutes) {
    return null;
  }

  return Math.max(
    0,
    todo.estimated_minutes - scheduledMinutes(todo)
  );
}

/**
 * 返回任务的排期比例，范围固定为 0~1。
 * 仅用于“已安排 / 尚未安排”的视觉表达，不是完成度。
 */
function scheduledRatio(todo: CalendarTodo) {
  if (!todo.estimated_minutes || todo.estimated_minutes <= 0) {
    return 0;
  }

  return Math.min(
    1,
    scheduledMinutes(todo) / todo.estimated_minutes
  );
}

/**
 * 新建 Session 时决定默认长度。
 * 默认 30 分钟；如果任务剩余预计时间不足 30 分钟，就只安排剩余部分。
 * 没有 estimated_minutes 的任务仍默认安排 30 分钟。
 */
function defaultSessionMinutes(todo: CalendarTodo) {
  const remaining = remainingMinutes(todo);

  if (remaining === null || remaining === 0) {
    return DEFAULT_SESSION_MINUTES;
  }

  return Math.min(DEFAULT_SESSION_MINUTES, remaining);
}

/**
 * 计算任务超出预计时间的已安排分钟数。
 * 允许用户主动“多排一点”，因此超排只做信息提示，不视为错误。
 */
function overplannedMinutes(todo: CalendarTodo) {
  if (!todo.estimated_minutes) {
    return 0;
  }

  return Math.max(
    0,
    scheduledMinutes(todo) - todo.estimated_minutes
  );
}

/**
 * 判断两个 ISO 时间区间是否真正重叠。
 * 首尾刚好相接不算冲突。
 */
function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  const a1 = new Date(startA).getTime();
  const a2 = new Date(endA).getTime();
  const b1 = new Date(startB).getTime();
  const b2 = new Date(endB).getTime();

  return a1 < b2 && a2 > b1;
}

/**
 * 在所有 Todo Session 中寻找时间冲突。
 * ignoreSessionId 用于移动 / resize 当前 Session 时排除它自己。
 */
function findSessionConflict(
  todos: CalendarTodo[],
  start: string,
  end: string,
  ignoreSessionId?: string
): SessionWithTodo | null {
  for (const todo of todos) {
    for (const session of todo.todo_sessions ?? []) {
      if (session.id === ignoreSessionId) {
        continue;
      }

      if (
        overlaps(
          start,
          end,
          session.scheduled_start,
          session.scheduled_end
        )
      ) {
        return { todo, session };
      }
    }
  }

  return null;
}

/**
 * 根据 Session ID 找到它所属的 Todo。
 * Calendar 选中、拖动 Session 时都通过这个 helper 解析 owner。
 */
function findSessionOwner(
  todos: CalendarTodo[],
  sessionId: string
): SessionWithTodo | null {
  for (const todo of todos) {
    const session = (todo.todo_sessions ?? []).find(
      (item) => item.id === sessionId
    );

    if (session) {
      return { todo, session };
    }
  }

  return null;
}

/**
 * 向指定 Todo 的 todo_sessions 中追加一个 Session。
 * 用于 optimistic UI：数据库返回前先让用户立即看到落位结果。
 */
function addSessionLocally(
  todos: CalendarTodo[],
  todoId: string,
  session: TodoSession
) {
  return todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          todo_sessions: [...(todo.todo_sessions ?? []), session],
        }
      : todo
  );
}

/**
 * 修改指定 Session，同时保持 React state 的不可变更新。
 */
function updateSessionLocally(
  todos: CalendarTodo[],
  todoId: string,
  sessionId: string,
  patch: Partial<TodoSession>
) {
  return todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          todo_sessions: (todo.todo_sessions ?? []).map((session) =>
            session.id === sessionId
              ? { ...session, ...patch }
              : session
          ),
        }
      : todo
  );
}

/**
 * 删除指定 Session 的本地副本。
 * 创建失败回滚和“取消排期”都会使用这个 helper。
 */
function removeSessionLocally(
  todos: CalendarTodo[],
  todoId: string,
  sessionId: string
) {
  return todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          todo_sessions: (todo.todo_sessions ?? []).filter(
            (session) => session.id !== sessionId
          ),
        }
      : todo
  );
}

/**
 * 将 optimistic 临时 Session ID 替换成数据库真正返回的 Session。
 */
function replaceSessionLocally(
  todos: CalendarTodo[],
  todoId: string,
  temporaryId: string,
  savedSession: TodoSession
) {
  return todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          todo_sessions: (todo.todo_sessions ?? []).map((session) =>
            session.id === temporaryId ? savedSession : session
          ),
        }
      : todo
  );
}

/* =========================================================
   Slot helpers
========================================================= */

type TimeSlot = {
  id: string;
  date: string;
  hour: number;
  minute: number;
};

/**
 * 根据当前日期生成 15 分钟粒度的 Calendar slots。
 */
function buildSlots(date: string) {
  const result: TimeSlot[] = [];

  for (
    let minuteFromStart = 0;
    minuteFromStart < TOTAL_MINUTES;
    minuteFromStart += SLOT_MINUTES
  ) {
    const absolute = DAY_START_HOUR * 60 + minuteFromStart;
    const hour = Math.floor(absolute / 60);
    const minute = absolute % 60;

    result.push({
      id: `slot:${date}:${hour}:${minute}`,
      date,
      hour,
      minute,
    });
  }

  return result;
}

/**
 * 解析 slot droppable ID。
 * 非 slot ID 返回 null。
 */
function readSlotId(id: string) {
  if (!id.startsWith("slot:")) {
    return null;
  }

  const raw = id.slice(5);
  const lastColon = raw.lastIndexOf(":");
  const secondLastColon = raw.lastIndexOf(":", lastColon - 1);

  if (lastColon < 0 || secondLastColon < 0) {
    return null;
  }

  return {
    date: raw.slice(0, secondLastColon),
    hour: Number(raw.slice(secondLastColon + 1, lastColon)),
    minute: Number(raw.slice(lastColon + 1)),
  };
}

/* =========================================================
   Task pool card
========================================================= */

/**
 * 左侧任务池中的可拖拽 Todo。
 * 整张卡片背景表示“排期比例”，并实时展示已安排 / 剩余时间。
 */
function PoolTask({ todo }: { todo: CalendarTodo }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `todo:${todo.id}`,
  });

  const category = categoryOf(todo);
  const scheduled = scheduledMinutes(todo);
  const remaining = remainingMinutes(todo);
  const overplanned = overplannedMinutes(todo);
  const progress = scheduledRatio(todo) * 100;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        touchAction: "none",
        userSelect: "none",
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
        flex cursor-grab items-center gap-3 rounded-2xl border border-line
        px-3 py-3 transition-[transform,box-shadow,opacity] duration-150
        active:cursor-grabbing
        ${
          isDragging
            ? "scale-[0.985] opacity-30"
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
          已安排 {formatMinutes(scheduled)}
          {overplanned > 0 ? (
            <> · 多安排 {formatMinutes(overplanned)}</>
          ) : (
            remaining !== null && (
              <> · 剩余 {formatMinutes(remaining)}</>
            )
          )}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Drag preview
========================================================= */

/**
 * 拖拽过程中跟随指针的轻量预览。
 * Todo 和 Session 都复用这张卡，避免拖拽过程中视觉跳变。
 */
function DragPreview({
  todo,
  durationMinutes,
}: {
  todo: CalendarTodo;
  durationMinutes: number;
}) {
  const category = categoryOf(todo);

  return (
    <div
      className={`
        w-[280px] scale-[1.015] rounded-2xl border px-3 py-3
        shadow-[0_14px_36px_rgba(60,50,40,0.12)] ${category.card}
      `}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-ink">
          {todo.title}
        </p>

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
        >
          {category.label}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-ink-faint">
        本次安排 {formatMinutes(durationMinutes)}
      </p>
    </div>
  );
}

/* =========================================================
   Calendar slot
========================================================= */

/**
 * 一个 15 分钟 Calendar droppable slot。
 * 拖拽悬停时直接显示“开始 → 结束”，让用户在松手前知道会落在哪里。
 */
function CalendarSlot({
  slot,
  activeTodo,
  activeDurationMinutes,
}: {
  slot: TimeSlot;
  activeTodo: CalendarTodo | null;
  activeDurationMinutes: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slot.id,
  });

  const category = activeTodo ? categoryOf(activeTodo) : null;

  const previewStart = makeLocalDate(
    slot.date,
    slot.hour,
    slot.minute
  );
  const previewEnd = new Date(
    previewStart.getTime() + activeDurationMinutes * 60000
  );

  return (
    <div
      ref={setNodeRef}
      style={{ height: SLOT_HEIGHT }}
      className={`
        relative transition-colors duration-100
        ${
          slot.minute === 0
            ? "border-t border-line"
            : slot.minute === 30
              ? "border-t border-line/55"
              : "border-t border-line/20"
        }
        ${isOver && category ? category.drop : ""}
      `}
    >
      {isOver && activeTodo && (
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-40 -translate-y-1/2">
          <div
            className={`rounded-xl border px-3 py-1.5 text-center text-[10px] shadow-sm ${category?.card}`}
          >
            {previewStart.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
            {" → "}
            {previewEnd.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Scheduled Session
========================================================= */

/**
 * Calendar 时间轴上的单个 Session block。
 *
 * 这里与 Todo 本体分离：
 * - Todo 表示“要做什么”；
 * - Session 表示“什么时候做这一段”。
 *
 * Session 可拖动到其他时间，也可从底部 resize 改变时长。
 */
function ScheduledSession({
  todo,
  session,
  selected,
  justPlaced,
  saving,
  starting,
  onSelect,
  onResize,
}: {
  todo: CalendarTodo;
  session: TodoSession;
  selected: boolean;
  justPlaced: boolean;
  saving: boolean;
  starting: boolean;
  onSelect: () => void;
  onResize: (
    todo: CalendarTodo,
    session: TodoSession,
    newEnd: string
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `session:${session.id}`,
  });

  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const category = categoryOf(todo);
  const start = new Date(session.scheduled_start);
  const effectiveEnd = previewEnd ?? session.scheduled_end;

  const startMinute = start.getHours() * 60 + start.getMinutes();
  const minuteFromStart = startMinute - DAY_START_HOUR * 60;

  if (minuteFromStart < 0 || minuteFromStart >= TOTAL_MINUTES) {
    return null;
  }

  const duration = Math.max(
    1,
    Math.round(
      (new Date(effectiveEnd).getTime() - start.getTime()) / 60000
    )
  );

  const top = (minuteFromStart / 60) * HOUR_HEIGHT;
  const rawHeight = (duration / 60) * HOUR_HEIGHT;
  const height = Math.max(36, rawHeight);
  const compact = height < 62;
  const running = todo.status === "running";

  /**
   * 开始 resize Session。
   * pointermove 只更新本地预览；pointerup 时才真正触发数据库保存。
   */
  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const originalDuration = duration;
    const pointerId = event.pointerId;

    event.currentTarget.setPointerCapture(pointerId);

    const move = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = snapMinutes(
        (deltaY / HOUR_HEIGHT) * 60
      );
      const newDuration = Math.max(
        SLOT_MINUTES,
        originalDuration + deltaMinutes
      );
      const newEnd = new Date(
        start.getTime() + newDuration * 60000
      );

      setPreviewEnd(newEnd.toISOString());
    };

    const finish = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);

      const deltaY = upEvent.clientY - startY;
      const deltaMinutes = snapMinutes(
        (deltaY / HOUR_HEIGHT) * 60
      );
      const newDuration = Math.max(
        SLOT_MINUTES,
        originalDuration + deltaMinutes
      );
      const newEnd = new Date(
        start.getTime() + newDuration * 60000
      ).toISOString();

      setPreviewEnd(null);
      onResize(todo, session, newEnd);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      style={{ top, height }}
      className={`
        absolute left-2 right-2 z-20 rounded-2xl border
        shadow-[0_3px_14px_rgba(60,50,40,0.045)]
        transition-[transform,box-shadow,opacity,filter] duration-150
        ${category.card}
        ${selected ? "ring-2 ring-sage-300/50" : ""}
        ${isDragging ? "opacity-25" : ""}
        ${justPlaced ? "scale-[1.02] ring-2 ring-sage-300/45" : ""}
        ${starting ? "brightness-[0.98] ring-2 ring-sage-500/20" : ""}
      `}
    >
      <div
        className={`relative h-full ${
          compact ? "px-3 py-1.5" : "px-3 py-2"
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            style={{ touchAction: "none" }}
            className="mt-0.5 shrink-0 cursor-grab rounded-md p-0.5 text-ink-faint/40 hover:bg-black/[0.03] active:cursor-grabbing"
            title="拖动这个时间段"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`truncate font-medium text-ink ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {todo.title}
              </p>

              <div className="flex shrink-0 items-center gap-1.5">
                {starting && (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[9px] text-sage-700">
                    <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
                    启动中
                  </span>
                )}

                {!starting && running && (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[9px] text-sage-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage-500" />
                    专注中
                  </span>
                )}

                {!compact && !starting && !running && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${category.badge}`}
                  >
                    {category.label}
                  </span>
                )}
              </div>
            </div>

            {!compact && (
              <p className="mt-1 text-[11px] text-ink-faint">
                {formatTime(session.scheduled_start)} – {formatTime(effectiveEnd)}
              </p>
            )}

            {height >= 92 && todo.description && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-ink-faint">
                {todo.description}
              </p>
            )}
          </div>
        </div>

        {saving && (
          <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] text-ink-faint">
            <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
            保存中
          </div>
        )}

        {!isDragging && (
          <button
            type="button"
            onPointerDown={beginResize}
            onClick={(event) => event.stopPropagation()}
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
 * 数据模型：Todo 负责任务本体，todo_sessions 负责一个或多个排期时间段。
 * 交互原则：所有拖拽先 optimistic 更新本地 UI，再后台写 Supabase；
 * 如果数据库失败则回滚，因此用户不会因为网络延迟而觉得“拖了没反应”。
 */
export default function CalendarPlanner({
  initialTodos,
  initialDate,
}: Props) {
  const router = useRouter();

  const [todos, setTodos] = useState<CalendarTodo[]>(initialTodos);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [startingFocusTodoId, setStartingFocusTodoId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  /* Edit form: 这里只编辑 Todo 本体，不再编辑 Session 时间。 */
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editCustomTag, setEditCustomTag] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    })
  );

  /**
   * 每分钟更新一次当前时间线位置。
   * 不需要每秒刷新，避免 Calendar 页面产生无意义 render。
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const slots = useMemo(
    () => buildSlots(selectedDate),
    [selectedDate]
  );

  /**
   * Task Pool 只显示“仍有时间待安排”的 Todo。
   * 没有 estimated_minutes 的 Todo 无法判断是否排满，因此一直保留在任务池。
   */
  const poolTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (todo.status === "completed") {
          return false;
        }

        const remaining = remainingMinutes(todo);
        return remaining === null || remaining > 0;
      }),
    [todos]
  );

  /**
   * 已经达到预计排期量的 Todo。
   * 它们默认折叠，但仍然可以继续拖拽，从而允许用户主动超排。
   */
  const fullyPlannedTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (todo.status === "completed") {
          return false;
        }

        const remaining = remainingMinutes(todo);
        return remaining !== null && remaining === 0;
      }),
    [todos]
  );

  /**
   * 将当前日期的 Session flatten 成 timeline 使用的结构。
   * V1 以 scheduled_start 所在日期作为 Session 的显示日期。
   */
  const scheduledSessions = useMemo(() => {
    const result: SessionWithTodo[] = [];

    for (const todo of todos) {
      for (const session of todo.todo_sessions ?? []) {
        if (localDatePart(session.scheduled_start) === selectedDate) {
          result.push({ todo, session });
        }
      }
    }

    return result.sort(
      (a, b) =>
        new Date(a.session.scheduled_start).getTime() -
        new Date(b.session.scheduled_start).getTime()
    );
  }, [todos, selectedDate]);

  const selectedSessionInfo = useMemo(
    () =>
      selectedSessionId
        ? findSessionOwner(todos, selectedSessionId)
        : null,
    [todos, selectedSessionId]
  );

  const activeSessionInfo = useMemo(() => {
    if (!activeDragId?.startsWith("session:")) {
      return null;
    }

    return findSessionOwner(todos, activeDragId.slice(8));
  }, [activeDragId, todos]);

  const activeTodo = useMemo(() => {
    if (!activeDragId) {
      return null;
    }

    if (activeDragId.startsWith("todo:")) {
      const todoId = activeDragId.slice(5);
      return todos.find((todo) => todo.id === todoId) ?? null;
    }

    return activeSessionInfo?.todo ?? null;
  }, [activeDragId, activeSessionInfo, todos]);

  const activeDurationMinutes = useMemo(() => {
    if (activeSessionInfo) {
      return sessionDurationMinutes(activeSessionInfo.session);
    }

    if (activeTodo) {
      return defaultSessionMinutes(activeTodo);
    }

    return DEFAULT_SESSION_MINUTES;
  }, [activeSessionInfo, activeTodo]);

  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index
  );

  /**
   * 计算“现在”在时间轴中的垂直位置。
   * 非今天、或当前时间超出显示范围时返回 null。
   */
  const currentTimeTop = useMemo(() => {
    const current = new Date(now);

    if (localDatePart(current.toISOString()) !== selectedDate) {
      return null;
    }

    const minutes = current.getHours() * 60 + current.getMinutes();
    const fromStart = minutes - DAY_START_HOUR * 60;

    if (fromStart < 0 || fromStart > TOTAL_MINUTES) {
      return null;
    }

    return (fromStart / 60) * HOUR_HEIGHT;
  }, [now, selectedDate]);

  /**
   * 短暂高亮刚创建 / 移动的 Session。
   * 视觉反馈持续 720ms，比网络响应更早出现。
   */
  function flashPlaced(id: string) {
    setJustPlacedId(id);

    window.setTimeout(() => {
      setJustPlacedId((current) => (current === id ? null : current));
    }, 720);
  }

  /**
   * 拖拽开始时记录 Todo 或 Session ID。
   * DragOverlay 和 slot 时间预览都依赖这个 state。
   */
  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);

    if (!id.startsWith("todo:") && !id.startsWith("session:")) {
      return;
    }

    setActiveDragId(id);
    setEditingTodoId(null);
    setError(null);
  }

  /**
   * 创建一个新的 todo_session。
   *
   * 交互顺序非常重要：
   * 1. 先用临时 ID 把 Session 插入本地 state，用户立刻看到落位；
   * 2. 再写 Supabase；
   * 3. 成功后把临时 ID 替换成真实 ID；
   * 4. 失败则回滚本地 Session，并显示错误。
   */
  async function createSession(
    todo: CalendarTodo,
    startIso: string,
    endIso: string
  ) {
    const conflict = findSessionConflict(
      todos,
      startIso,
      endIso
    );

    if (conflict) {
      setError(
        `这个时间段和「${conflict.todo.title}」重叠。请换一个时间。`
      );
      return;
    }

    const temporaryId = `temp-${crypto.randomUUID()}`;
    const optimisticSession: TodoSession = {
      id: temporaryId,
      scheduled_start: startIso,
      scheduled_end: endIso,
    };

    setTodos((current) =>
      addSessionLocally(current, todo.id, optimisticSession)
    );
    setSelectedSessionId(temporaryId);
    setBusyId(temporaryId);
    flashPlaced(temporaryId);

    const supabase = createClient();
    const {
      data,
      error: insertError,
    } = await supabase
      .from("todo_sessions")
      .insert({
        todo_id: todo.id,
        scheduled_start: startIso,
        scheduled_end: endIso,
      })
      .select("id, scheduled_start, scheduled_end")
      .single();

    setBusyId(null);

    if (insertError || !data) {
      setTodos((current) =>
        removeSessionLocally(current, todo.id, temporaryId)
      );
      setSelectedSessionId(null);
      setError(
        "保存排期失败：" +
          (insertError?.message ?? "没有返回 Session 数据")
      );
      return;
    }

    const savedSession: TodoSession = {
      id: data.id,
      scheduled_start: data.scheduled_start,
      scheduled_end: data.scheduled_end,
    };

    setTodos((current) =>
      replaceSessionLocally(
        current,
        todo.id,
        temporaryId,
        savedSession
      )
    );
    setSelectedSessionId(savedSession.id);
    flashPlaced(savedSession.id);
  }

  /**
   * 移动已经存在的 Session。
   * 保留原 Session 时长，只改变 scheduled_start / scheduled_end。
   */
  async function moveSession(
    todo: CalendarTodo,
    session: TodoSession,
    startIso: string,
    endIso: string
  ) {
    if (startIso === session.scheduled_start) {
      return;
    }

    const conflict = findSessionConflict(
      todos,
      startIso,
      endIso,
      session.id
    );

    if (conflict) {
      setError(
        `这个时间段和「${conflict.todo.title}」重叠。请换一个时间。`
      );
      return;
    }

    const previousStart = session.scheduled_start;
    const previousEnd = session.scheduled_end;

    setTodos((current) =>
      updateSessionLocally(current, todo.id, session.id, {
        scheduled_start: startIso,
        scheduled_end: endIso,
      })
    );
    setSelectedSessionId(session.id);
    setBusyId(session.id);
    flashPlaced(session.id);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("todo_sessions")
      .update({
        scheduled_start: startIso,
        scheduled_end: endIso,
      })
      .eq("id", session.id);

    setBusyId(null);

    if (updateError) {
      setTodos((current) =>
        updateSessionLocally(current, todo.id, session.id, {
          scheduled_start: previousStart,
          scheduled_end: previousEnd,
        })
      );
      setError("移动时间段失败：" + updateError.message);
    }
  }

  /**
   * 统一处理 Todo / Session drop 到时间槽。
   * Todo -> 新建 Session；Session -> 移动原 Session。
   */
  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    setActiveDragId(null);

    if (!overId) {
      return;
    }

    const slot = readSlotId(overId);

    if (!slot) {
      return;
    }

    const start = makeLocalDate(
      slot.date,
      slot.hour,
      slot.minute
    );

    if (activeId.startsWith("todo:")) {
      const todoId = activeId.slice(5);
      const todo = todos.find((item) => item.id === todoId);

      if (!todo) {
        return;
      }

      const duration = defaultSessionMinutes(todo);
      const end = new Date(start.getTime() + duration * 60000);

      await createSession(
        todo,
        start.toISOString(),
        end.toISOString()
      );
      return;
    }

    if (activeId.startsWith("session:")) {
      const sessionId = activeId.slice(8);
      const owner = findSessionOwner(todos, sessionId);

      if (!owner) {
        return;
      }

      const duration = sessionDurationMinutes(owner.session);
      const end = new Date(start.getTime() + duration * 60000);

      await moveSession(
        owner.todo,
        owner.session,
        start.toISOString(),
        end.toISOString()
      );
    }
  }

  /**
   * 保存 resize 后的新 Session 结束时间。
   * 先本地更新，再写数据库；失败时恢复旧结束时间。
   */
  async function handleResize(
    todo: CalendarTodo,
    session: TodoSession,
    newEnd: string
  ) {
    const conflict = findSessionConflict(
      todos,
      session.scheduled_start,
      newEnd,
      session.id
    );

    if (conflict) {
      setError(
        `拉长后会和「${conflict.todo.title}」重叠，所以没有保存。`
      );
      return;
    }

    const previousEnd = session.scheduled_end;

    setTodos((current) =>
      updateSessionLocally(current, todo.id, session.id, {
        scheduled_end: newEnd,
      })
    );
    setBusyId(session.id);

    const supabase = createClient();
    const { error: resizeError } = await supabase
      .from("todo_sessions")
      .update({ scheduled_end: newEnd })
      .eq("id", session.id);

    setBusyId(null);

    if (resizeError) {
      setTodos((current) =>
        updateSessionLocally(current, todo.id, session.id, {
          scheduled_end: previousEnd,
        })
      );
      setError("修改时间长度失败：" + resizeError.message);
    }
  }

  /**
   * 删除一个 Calendar Session，也就是“取消这一段排期”。
   * Todo 本体不会被删除，任务会根据剩余时间重新出现在任务池中。
   */
  async function removeSession(
    todo: CalendarTodo,
    session: TodoSession
  ) {
    const previousTodos = todos;

    setTodos((current) =>
      removeSessionLocally(current, todo.id, session.id)
    );
    setSelectedSessionId(null);
    setBusyId(session.id);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("todo_sessions")
      .delete()
      .eq("id", session.id);

    setBusyId(null);

    if (deleteError) {
      setTodos(previousTodos);
      setSelectedSessionId(session.id);
      setError("取消排期失败：" + deleteError.message);
    }
  }

  /**
   * 打开 Todo 编辑状态。
   * Calendar v2 中这里只编辑任务本体；Session 时间通过拖动 / resize 管理。
   */
  function startEditing(todo: CalendarTodo) {
    setEditingTodoId(todo.id);
    setEditTitle(todo.title);
    setEditMinutes(
      todo.estimated_minutes ? String(todo.estimated_minutes) : ""
    );
    setEditCategory(todo.category);
    setEditCustomTag(todo.custom_tag ?? "");
    setError(null);
  }

  /**
   * 退出编辑并清空临时表单状态。
   */
  function cancelEditing() {
    setEditingTodoId(null);
    setEditTitle("");
    setEditMinutes("");
    setEditCategory(null);
    setEditCustomTag("");
  }

  /**
   * 保存 Todo 本体字段。
   * 不再写 todos.scheduled_start / scheduled_end，避免和 todo_sessions 两套数据打架。
   */
  async function saveEdit(todo: CalendarTodo) {
    const title = editTitle.trim();

    if (!title) {
      setError("任务名称不能为空。");
      return;
    }

    const minutes = editMinutes.trim() ? Number(editMinutes) : null;

    if (
      minutes !== null &&
      (!Number.isFinite(minutes) || minutes <= 0)
    ) {
      setError("预计时间需要是大于 0 的分钟数。");
      return;
    }

    const previousTodos = todos;
    const customTag =
      editCategory === "other" && editCustomTag.trim()
        ? editCustomTag.trim()
        : null;

    setTodos((current) =>
      current.map((item) =>
        item.id === todo.id
          ? {
              ...item,
              title,
              estimated_minutes: minutes,
              category: editCategory,
              custom_tag: customTag,
            }
          : item
      )
    );
    setBusyId(todo.id);

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("todos")
      .update({
        title,
        estimated_minutes: minutes,
        category: editCategory,
        custom_tag: customTag,
      })
      .eq("id", todo.id);

    setBusyId(null);

    if (saveError) {
      setTodos(previousTodos);
      setError("保存修改失败：" + saveError.message);
      return;
    }

    cancelEditing();
  }

  /**
   * 将 Todo 标记为已完成。
   * todo_sessions 保留历史排期记录，不在完成任务时删除。
   */
  async function completeTodo(todo: CalendarTodo) {
    const previousTodos = todos;
    let elapsed = todo.elapsed_seconds ?? 0;

    if (todo.status === "running" && todo.started_at) {
      elapsed += Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(todo.started_at).getTime()) / 1000
        )
      );
    }

    setTodos((current) =>
      current.map((item) =>
        item.id === todo.id
          ? {
              ...item,
              status: "completed",
              started_at: null,
              elapsed_seconds: elapsed,
            }
          : item
      )
    );
    setSelectedSessionId(null);
    setBusyId(todo.id);

    const supabase = createClient();
    const { error: completeError } = await supabase
      .from("todos")
      .update({
        status: "completed",
        started_at: null,
        elapsed_seconds: elapsed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", todo.id);

    setBusyId(null);

    if (completeError) {
      setTodos(previousTodos);
      setError("完成任务失败：" + completeError.message);
    }
  }

  /**
   * 进入 Todo 的 Focus 页面。
   *
   * UI 会先进入“启动中”状态，再处理正在运行的其他任务和页面跳转；
   * 这样即使网络操作需要几百毫秒，用户点击后也会立刻得到反馈。
   */
  async function openFocus(todo: CalendarTodo) {
    if (startingFocusTodoId) {
      return;
    }

    setStartingFocusTodoId(todo.id);
    setError(null);

    const running = todos.find(
      (item) => item.status === "running" && item.id !== todo.id
    );

    if (running) {
      const shouldSwitch = window.confirm(
        `「${running.title}」还在计时。\n\n要暂停它并开始「${todo.title}」吗？`
      );

      if (!shouldSwitch) {
        setStartingFocusTodoId(null);
        return;
      }

      let elapsed = running.elapsed_seconds ?? 0;

      if (running.started_at) {
        elapsed += Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(running.started_at).getTime()) /
              1000
          )
        );
      }

      const supabase = createClient();
      const { error: pauseError } = await supabase
        .from("todos")
        .update({
          status: "paused",
          started_at: null,
          elapsed_seconds: elapsed,
        })
        .eq("id", running.id);

      if (pauseError) {
        setStartingFocusTodoId(null);
        setError("暂停当前 Focus 失败：" + pauseError.message);
        return;
      }

      setTodos((current) =>
        current.map((item) =>
          item.id === running.id
            ? {
                ...item,
                status: "paused",
                started_at: null,
                elapsed_seconds: elapsed,
              }
            : item
        )
      );
    }

    router.push(`/focus/${todo.id}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveDragId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="mt-6">
        {/* =================================================
            Header
        ================================================= */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">日历</h1>
            <p className="mt-1 text-sm text-ink-faint">
              把一件大事拆成几个小时间段，慢慢安排进今天。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => {
                setSelectedDate(addDays(selectedDate, -1));
                setSelectedSessionId(null);
              }}
              aria-label="前一天"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-sage-50"
              onClick={() => {
                setSelectedDate(initialDate);
                setSelectedSessionId(null);
              }}
            >
              今天
            </button>

            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => {
                setSelectedDate(addDays(selectedDate, 1));
                setSelectedSessionId(null);
              }}
              aria-label="后一天"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-blush-100 bg-blush-50 px-4 py-3 text-sm text-blush-500">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="关闭错误提示"
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">任务池</h2>
                  <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[10px] text-sage-700">
                    {poolTodos.length} 待安排
                  </span>
                </div>

                <p className="mt-1 text-xs leading-5 text-ink-faint">
                  每拖一次默认安排 30 分钟；没有排完的任务会继续留在这里。
                </p>
              </div>

              <Link
                href="/todo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/50"
                aria-label="新建任务"
              >
                <Plus className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 space-y-2">
              {poolTodos.length === 0 && (
                <div className="rounded-2xl bg-sage-50 px-4 py-6 text-center">
                  <p className="text-sm text-ink-soft">
                    需要安排的任务都已经放进日历了
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    可以继续调整时间，也可以开始专注。
                  </p>
                </div>
              )}

              {poolTodos.map((todo) => (
                <PoolTask key={todo.id} todo={todo} />
              ))}
            </div>

            {fullyPlannedTodos.length > 0 && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer select-none text-[11px] text-ink-faint transition hover:text-ink-soft">
                  已排满 {fullyPlannedTodos.length} 个任务
                </summary>

                <div className="mt-3 space-y-2">
                  {fullyPlannedTodos.map((todo) => (
                    <PoolTask key={`planned-${todo.id}`} todo={todo} />
                  ))}
                </div>

                <p className="mt-2 text-[10px] leading-4 text-ink-faint">
                  仍可继续拖动；超出预计时间只会提示，不会阻止排期。
                </p>
              </details>
            )}
          </aside>

          {/* =================================================
              Calendar
          ================================================= */}
          <section className="card min-w-0 overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {formatDateTitle(selectedDate)}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {scheduledSessions.length} 个时间段
                    {scheduledSessions.length > 0 && (
                      <>
                        {" · "}
                        {
                          new Set(
                            scheduledSessions.map(({ todo }) => todo.id)
                          ).size
                        }{" "}
                        个任务
                      </>
                    )}
                  </p>
                </div>

                {activeTodo && (
                  <div className="hidden rounded-full bg-sage-50 px-3 py-1.5 text-xs text-sage-700 sm:block">
                    松手后立即落位，保存会在后台完成
                  </div>
                )}
              </div>
            </div>

            {/* ===============================================
                Selected Session / task detail
            =============================================== */}
            {selectedSessionInfo && (
              <div className="border-b border-line bg-paper/55 px-5 py-4">
                {editingTodoId === selectedSessionInfo.todo.id ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">编辑任务</p>
                        <p className="mt-1 text-xs text-ink-faint">
                          这里只改任务本体；时间段请直接拖动或拉伸。
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
                        aria-label="取消编辑"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="input w-full"
                      placeholder="任务名称"
                    />

                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(CATEGORY_INFO) as Category[]).map(
                        (category) => {
                          const info = CATEGORY_INFO[category];
                          const selected = editCategory === category;

                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setEditCategory(category)}
                              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                selected
                                  ? info.selected
                                  : "border-line bg-white text-ink-soft"
                              }`}
                            >
                              {info.label}
                            </button>
                          );
                        }
                      )}
                    </div>

                    {editCategory === "other" && (
                      <input
                        value={editCustomTag}
                        onChange={(event) =>
                          setEditCustomTag(event.target.value)
                        }
                        className="input w-full"
                        placeholder="自定义类别"
                      />
                    )}

                    <label className="block max-w-[220px]">
                      <span className="mb-1 block text-xs text-ink-faint">
                        预计工作分钟
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={editMinutes}
                        onChange={(event) =>
                          setEditMinutes(event.target.value)
                        }
                        className="input w-full"
                      />
                    </label>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="btn-ghost"
                      >
                        取消
                      </button>

                      <button
                        type="button"
                        disabled={busyId === selectedSessionInfo.todo.id}
                        onClick={() => saveEdit(selectedSessionInfo.todo)}
                        className="btn-primary flex items-center gap-2"
                      >
                        {busyId === selectedSessionInfo.todo.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {selectedSessionInfo.todo.title}
                        </p>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${categoryOf(
                            selectedSessionInfo.todo
                          ).badge}`}
                        >
                          {categoryOf(selectedSessionInfo.todo).label}
                        </span>

                        {selectedSessionInfo.todo.status === "running" && (
                          <span className="flex items-center gap-1 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] text-sage-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage-500" />
                            专注中
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatTime(
                            selectedSessionInfo.session.scheduled_start
                          )}
                          {" – "}
                          {formatTime(
                            selectedSessionInfo.session.scheduled_end
                          )}
                        </span>

                        <span>
                          已安排 {formatMinutes(
                            scheduledMinutes(selectedSessionInfo.todo)
                          )}
                        </span>

                        {remainingMinutes(selectedSessionInfo.todo) !== null && (
                          <span>
                            剩余 {formatMinutes(
                              remainingMinutes(selectedSessionInfo.todo) ?? 0
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          startingFocusTodoId === selectedSessionInfo.todo.id
                        }
                        onClick={() => openFocus(selectedSessionInfo.todo)}
                        className="flex items-center gap-2 rounded-xl bg-sage-100 px-3 py-2 text-sm font-medium text-sage-700 transition hover:bg-sage-300/60 disabled:cursor-wait disabled:opacity-70"
                      >
                        {startingFocusTodoId === selectedSessionInfo.todo.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}

                        {startingFocusTodoId === selectedSessionInfo.todo.id
                          ? "打开中…"
                          : new Date(
                                selectedSessionInfo.session.scheduled_start
                              ).getTime() > Date.now()
                            ? "提前开始"
                            : "开始专注"}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditing(selectedSessionInfo.todo)}
                        className="btn-ghost flex items-center gap-2"
                      >
                        <Pencil className="h-4 w-4" />
                        编辑
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeSession(
                            selectedSessionInfo.todo,
                            selectedSessionInfo.session
                          )
                        }
                        className="btn-ghost flex items-center gap-2 text-ink-faint hover:text-blush-500"
                      >
                        <Trash2 className="h-4 w-4" />
                        取消排期
                      </button>

                      <button
                        type="button"
                        onClick={() => completeTodo(selectedSessionInfo.todo)}
                        className="flex items-center gap-2 rounded-xl bg-blush-50 px-3 py-2 text-sm font-medium text-blush-500 transition hover:bg-blush-100"
                      >
                        <Check className="h-4 w-4" />
                        完成
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(null)}
                        className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
                        aria-label="关闭详情"
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
                height: TOTAL_HEIGHT + TIMELINE_BOTTOM_SPACE,
              }}
            >
              {/* Hour labels */}
              <div className="pointer-events-none absolute left-0 top-0 h-full w-[64px] border-r border-line">
                {hours.map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute right-3 -translate-y-1/2 text-[11px] text-ink-faint"
                    style={{ top: index * HOUR_HEIGHT }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              <div
                className="absolute left-[64px] right-0 top-0"
                style={{ height: TOTAL_HEIGHT }}
              >
                {/* Slots */}
                {slots.map((slot) => (
                  <CalendarSlot
                    key={slot.id}
                    slot={slot}
                    activeTodo={activeTodo}
                    activeDurationMinutes={activeDurationMinutes}
                  />
                ))}

                {/* Current time indicator */}
                {currentTimeTop !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                    style={{ top: currentTimeTop }}
                  >
                    <span className="-ml-1 h-2 w-2 rounded-full bg-sage-500 shadow-sm" />
                    <span className="h-px flex-1 bg-sage-500/55" />
                  </div>
                )}

                {/* Sessions */}
                <div className="absolute inset-0">
                  {scheduledSessions.map(({ todo, session }) => (
                    <ScheduledSession
                      key={session.id}
                      todo={todo}
                      session={session}
                      selected={selectedSessionId === session.id}
                      justPlaced={justPlacedId === session.id}
                      saving={busyId === session.id}
                      starting={startingFocusTodoId === todo.id}
                      onSelect={() => {
                        if (!activeDragId) {
                          setSelectedSessionId((current) =>
                            current === session.id ? null : session.id
                          );
                          setEditingTodoId(null);
                        }
                      }}
                      onResize={handleResize}
                    />
                  ))}
                </div>
              </div>
            </div>

            {busyId && (
              <div className="flex items-center justify-end gap-1.5 border-t border-line bg-paper/60 px-5 py-2 text-[10px] text-ink-faint">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                后台保存中…
              </div>
            )}
          </section>
        </div>
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 160,
          easing: "cubic-bezier(0.22, 0.8, 0.3, 1)",
        }}
      >
        {activeTodo ? (
          <DragPreview
            todo={activeTodo}
            durationMinutes={activeDurationMinutes}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
