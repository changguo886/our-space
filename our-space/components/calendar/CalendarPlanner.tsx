"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GripHorizontal,
  GripVertical,
  ListChecks,
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
  useRef,
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
import DurationInput, {
  durationValueToMinutes,
  type DurationUnit,
} from "@/components/DurationInput";
import TodoSubtasks from "@/components/TodoSubtasks";
import QuickNotes from "@/components/QuickNotes";

/* =========================================================
   Types
========================================================= */

type Category = "work" | "study" | "life" | "rest" | "other";
type ContextTab = "overview" | "steps" | "notes";

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

type TimeSlot = {
  id: string;
  date: string;
  hour: number;
  minute: number;
};

/* =========================================================
   Calendar V3 layout

   底层永远是 24 小时。

   默认 UI 只展开一个“智能时间窗”：
   - 基础窗口 07:00–23:00
   - 当天有更早 / 更晚的 Session 时自动扩展
   - 今天的当前时间永远不会被隐藏
   - 两端 quiet hours 用 compressed band 表示
   - 点击 compressed band 可展开完整 24 小时
========================================================= */

const FULL_DAY_START_HOUR = 0;
const FULL_DAY_END_HOUR = 24;

const BASE_VISIBLE_START_HOUR = 7;
const BASE_VISIBLE_END_HOUR = 23;

const HOUR_HEIGHT = 88;
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = HOUR_HEIGHT / 4;

/*
 * 给时间轴顶部留一点呼吸空间。
 * 第一条小时刻度使用 -translate-y-1/2，若从 top: 0 开始会被 Header 截断。
 */
const TIMELINE_TOP_PADDING = 20;

const TIMELINE_BOTTOM_SPACE = 28;
const DEFAULT_SESSION_MINUTES = 30;

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

function addDays(dateString: string, amount: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day + amount);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDateTitle(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

function localDatePart(iso: string) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatClockMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.min(24 * 60, totalMinutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function makeLocalDate(
  dateString: string,
  hour: number,
  minute: number
) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

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

function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/* =========================================================
   Session helpers
========================================================= */

function sessionDurationMinutes(session: TodoSession) {
  const start = new Date(session.scheduled_start).getTime();
  const end = new Date(session.scheduled_end).getTime();

  return Math.max(0, Math.round((end - start) / 60000));
}

function scheduledMinutes(todo: CalendarTodo) {
  return (todo.todo_sessions ?? []).reduce(
    (total, session) => total + sessionDurationMinutes(session),
    0
  );
}

function remainingMinutes(todo: CalendarTodo) {
  if (!todo.estimated_minutes) {
    return null;
  }

  return Math.max(0, todo.estimated_minutes - scheduledMinutes(todo));
}

function scheduledRatio(todo: CalendarTodo) {
  if (!todo.estimated_minutes || todo.estimated_minutes <= 0) {
    return 0;
  }

  return Math.min(1, scheduledMinutes(todo) / todo.estimated_minutes);
}

function defaultSessionMinutes(todo: CalendarTodo) {
  const remaining = remainingMinutes(todo);

  if (remaining === null || remaining === 0) {
    return DEFAULT_SESSION_MINUTES;
  }

  return Math.min(DEFAULT_SESSION_MINUTES, remaining);
}

function overplannedMinutes(todo: CalendarTodo) {
  if (!todo.estimated_minutes) {
    return 0;
  }

  return Math.max(0, scheduledMinutes(todo) - todo.estimated_minutes);
}

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
   Smart 24-hour window
========================================================= */

function getSmartVisibleWindow(
  sessions: SessionWithTodo[],
  selectedDate: string,
  nowMs: number,
  fullDay: boolean
) {
  if (fullDay) {
    return {
      startHour: FULL_DAY_START_HOUR,
      endHour: FULL_DAY_END_HOUR,
    };
  }

  let startHour = BASE_VISIBLE_START_HOUR;
  let endHour = BASE_VISIBLE_END_HOUR;

  for (const { session } of sessions) {
    const start = new Date(session.scheduled_start);
    const end = new Date(session.scheduled_end);

    const sessionStartHour = start.getHours() + start.getMinutes() / 60;
    const sessionEndHour =
      end.getHours() + end.getMinutes() / 60 + (localDatePart(session.scheduled_end) !== selectedDate ? 24 : 0);

    /*
     * 有内容的时间不允许被隐藏。
     * 前后各留约 1 小时呼吸空间。
     */
    startHour = Math.min(startHour, Math.floor(sessionStartHour) - 1);
    endHour = Math.max(endHour, Math.ceil(sessionEndHour) + 1);
  }

  const current = new Date(nowMs);
  const today = localDatePart(current.toISOString());

  if (today === selectedDate) {
    const currentHour = current.getHours() + current.getMinutes() / 60;

    /*
     * “现在”永远不能藏在 collapsed quiet hours 里。
     */
    startHour = Math.min(startHour, Math.floor(currentHour) - 1);
    endHour = Math.max(endHour, Math.ceil(currentHour) + 1);
  }

  return {
    startHour: clamp(startHour, FULL_DAY_START_HOUR, FULL_DAY_END_HOUR - 1),
    endHour: clamp(endHour, 1, FULL_DAY_END_HOUR),
  };
}

function buildSlots(date: string, startHour: number, endHour: number) {
  const result: TimeSlot[] = [];
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  for (
    let absolute = startMinutes;
    absolute < endMinutes;
    absolute += SLOT_MINUTES
  ) {
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
   Task Pool card
========================================================= */

function PoolTask({ todo }: { todo: CalendarTodo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
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
            remaining !== null && <> · 剩余 {formatMinutes(remaining)}</>
          )}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Drag preview
========================================================= */

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
        <p className="truncate text-sm font-medium text-ink">{todo.title}</p>

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
  const previewStart = makeLocalDate(slot.date, slot.hour, slot.minute);
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

function ScheduledSession({
  todo,
  session,
  visibleStartHour,
  visibleEndHour,
  selected,
  justPlaced,
  saving,
  starting,
  onSelect,
  onResize,
}: {
  todo: CalendarTodo;
  session: TodoSession;
  visibleStartHour: number;
  visibleEndHour: number;
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `session:${session.id}`,
  });

  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const category = categoryOf(todo);
  const start = new Date(session.scheduled_start);
  const effectiveEnd = previewEnd ?? session.scheduled_end;

  const startMinute = start.getHours() * 60 + start.getMinutes();
  const visibleStartMinute = visibleStartHour * 60;
  const visibleEndMinute = visibleEndHour * 60;

  if (startMinute < visibleStartMinute || startMinute >= visibleEndMinute) {
    return null;
  }

  const duration = Math.max(
    1,
    Math.round(
      (new Date(effectiveEnd).getTime() - start.getTime()) / 60000
    )
  );

  const minuteFromVisibleStart = startMinute - visibleStartMinute;
  const top = (minuteFromVisibleStart / 60) * HOUR_HEIGHT;
  const rawHeight = (duration / 60) * HOUR_HEIGHT;
  const maxHeight = Math.max(
    24,
    ((visibleEndMinute - startMinute) / 60) * HOUR_HEIGHT
  );
  const height = Math.min(Math.max(36, rawHeight), maxHeight);
  const compact = height < 62;
  const running = todo.status === "running";

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const originalDuration = duration;
    const pointerId = event.pointerId;

    event.currentTarget.setPointerCapture(pointerId);

    const move = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = snapMinutes((deltaY / HOUR_HEIGHT) * 60);
      const newDuration = Math.max(
        SLOT_MINUTES,
        originalDuration + deltaMinutes
      );
      const newEnd = new Date(start.getTime() + newDuration * 60000);

      setPreviewEnd(newEnd.toISOString());
    };

    const finish = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);

      const deltaY = upEvent.clientY - startY;
      const deltaMinutes = snapMinutes((deltaY / HOUR_HEIGHT) * 60);
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
      <div className={`relative h-full ${compact ? "px-3 py-1.5" : "px-3 py-2"}`}>
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
   Quiet hours compressed band
========================================================= */

function QuietHoursBand({
  startHour,
  endHour,
  nowMinutes,
  onExpand,
}: {
  startHour: number;
  endHour: number;
  nowMinutes: number | null;
  onExpand: () => void;
}) {
  const hours = endHour - startHour;

  if (hours <= 0) {
    return null;
  }

  const includesNow =
    nowMinutes !== null &&
    nowMinutes >= startHour * 60 &&
    nowMinutes < endHour * 60;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex w-full items-center gap-3 border-y border-line/60 bg-paper/55 px-4 py-2.5 text-left transition hover:bg-sage-50/55"
      title="展开完整 24 小时时间轴"
    >
      <span className="h-px flex-1 bg-line" />

      <span className="flex shrink-0 items-center gap-2 rounded-full border border-line/70 bg-white/70 px-3 py-1 text-[10px] text-ink-faint shadow-sm transition group-hover:border-sage-200 group-hover:text-sage-700">
        <ChevronDown className="h-3 w-3" />
        {formatClockMinutes(startHour * 60)} – {formatClockMinutes(endHour * 60)}
        <span>· {hours}h collapsed</span>
        {includesNow && (
          <span className="ml-1 rounded-full bg-sage-100 px-1.5 py-0.5 font-medium text-sage-700">
            Now · {formatClockMinutes(nowMinutes)}
          </span>
        )}
      </span>

      <span className="h-px flex-1 bg-line" />
    </button>
  );
}

/* =========================================================
   Context panel
========================================================= */

function ContextTabButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[11px] font-medium transition ${
        active
          ? "border-sage-500 text-sage-700"
          : "border-transparent text-ink-faint hover:text-ink-soft"
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/* =========================================================
   Main
========================================================= */

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
  const [contextTab, setContextTab] = useState<ContextTab>("overview");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [startingFocusTodoId, setStartingFocusTodoId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  /*
   * false = Smart Window
   * true  = 显示完整 00:00–24:00
   */
  const [showFullDay, setShowFullDay] = useState(false);

  /*
   * 只在第一次打开“今天”，或日期切回今天时自动滚到 Now。
   */
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledDateRef = useRef<string | null>(null);

  /* Edit form */
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [editDurationUnit, setEditDurationUnit] =
    useState<DurationUnit>("minute");
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setShowFullDay(false);
    setSelectedSessionId(null);
    setEditingTodoId(null);
    setContextTab("overview");
    lastAutoScrolledDateRef.current = null;
  }, [selectedDate]);

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

  const visibleWindow = useMemo(
    () =>
      getSmartVisibleWindow(
        scheduledSessions,
        selectedDate,
        now,
        showFullDay
      ),
    [scheduledSessions, selectedDate, now, showFullDay]
  );

  const visibleStartHour = visibleWindow.startHour;
  const visibleEndHour = visibleWindow.endHour;
  const visibleTotalMinutes =
    (visibleEndHour - visibleStartHour) * 60;
  const visibleTotalHeight =
    (visibleEndHour - visibleStartHour) * HOUR_HEIGHT;

  const slots = useMemo(
    () => buildSlots(selectedDate, visibleStartHour, visibleEndHour),
    [selectedDate, visibleStartHour, visibleEndHour]
  );

  const hours = useMemo(
    () =>
      Array.from(
        { length: visibleEndHour - visibleStartHour + 1 },
        (_, index) => visibleStartHour + index
      ),
    [visibleStartHour, visibleEndHour]
  );

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

  const currentTimeInfo = useMemo(() => {
    const current = new Date(now);

    if (localDatePart(current.toISOString()) !== selectedDate) {
      return null;
    }

    const minutes = current.getHours() * 60 + current.getMinutes();
    const fromStart = minutes - visibleStartHour * 60;

    if (fromStart < 0 || fromStart > visibleTotalMinutes) {
      return null;
    }

    return {
      minutes,
      label: formatClockMinutes(minutes),
      top: (fromStart / 60) * HOUR_HEIGHT,
    };
  }, [now, selectedDate, visibleStartHour, visibleTotalMinutes]);

  const nowMinutesForSelectedDate = useMemo(() => {
    const current = new Date(now);

    if (localDatePart(current.toISOString()) !== selectedDate) {
      return null;
    }

    return current.getHours() * 60 + current.getMinutes();
  }, [now, selectedDate]);

  /*
   * 今天打开 Calendar 时，把 Now 放到 viewport 上方约 35% 的位置。
   */
  useEffect(() => {
    if (!currentTimeInfo || !timelineScrollRef.current) {
      return;
    }

    if (lastAutoScrolledDateRef.current === selectedDate) {
      return;
    }

    lastAutoScrolledDateRef.current = selectedDate;

    const container = timelineScrollRef.current;
    const target = Math.max(
      0,
      TIMELINE_TOP_PADDING +
        currentTimeInfo.top -
        container.clientHeight * 0.35
    );

    requestAnimationFrame(() => {
      container.scrollTo({
        top: target,
        behavior: "smooth",
      });
    });
  }, [currentTimeInfo, selectedDate]);

  function flashPlaced(id: string) {
    setJustPlacedId(id);

    window.setTimeout(() => {
      setJustPlacedId((current) => (current === id ? null : current));
    }, 720);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);

    if (!id.startsWith("todo:") && !id.startsWith("session:")) {
      return;
    }

    setActiveDragId(id);
    setEditingTodoId(null);
    setError(null);
  }

  async function createSession(
    todo: CalendarTodo,
    startIso: string,
    endIso: string
  ) {
    const conflict = findSessionConflict(todos, startIso, endIso);

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
    setContextTab("overview");
    setBusyId(temporaryId);
    flashPlaced(temporaryId);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
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
      replaceSessionLocally(current, todo.id, temporaryId, savedSession)
    );
    setSelectedSessionId(savedSession.id);
    flashPlaced(savedSession.id);
  }

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
    setContextTab("overview");
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

    const start = makeLocalDate(slot.date, slot.hour, slot.minute);

    if (activeId.startsWith("todo:")) {
      const todoId = activeId.slice(5);
      const todo = todos.find((item) => item.id === todoId);

      if (!todo) {
        return;
      }

      const duration = defaultSessionMinutes(todo);
      const end = new Date(start.getTime() + duration * 60000);

      await createSession(todo, start.toISOString(), end.toISOString());
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

  async function removeSession(todo: CalendarTodo, session: TodoSession) {
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

  function startEditing(todo: CalendarTodo) {
    setEditingTodoId(todo.id);
    setEditTitle(todo.title);
    setEditDurationUnit("minute");
    setEditMinutes(
      todo.estimated_minutes ? String(todo.estimated_minutes) : ""
    );
    setEditCategory(todo.category);
    setEditCustomTag(todo.custom_tag ?? "");
    setError(null);
  }

  function cancelEditing() {
    setEditingTodoId(null);
    setEditTitle("");
    setEditMinutes("");
    setEditDurationUnit("minute");
    setEditCategory(null);
    setEditCustomTag("");
  }

  async function saveEdit(todo: CalendarTodo) {
    const title = editTitle.trim();

    if (!title) {
      setError("任务名称不能为空。");
      return;
    }

    const minutes =
      durationValueToMinutes(
        editMinutes,
        editDurationUnit
      );

    if (
      minutes !== null &&
      Number.isNaN(minutes)
    ) {
      setError("预计时间需要是大于 0 的数字。");
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

  function openSelectedSession(sessionId: string) {
    setSelectedSessionId((current) => {
      if (current === sessionId) {
        return null;
      }

      return sessionId;
    });
    setContextTab("overview");
    setEditingTodoId(null);
  }

  const contextOpen = Boolean(selectedSessionInfo);
  const layoutClass = contextOpen
    ? "xl:grid-cols-[280px_minmax(520px,1fr)_380px]"
    : "xl:grid-cols-[300px_minmax(0,1fr)]";

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">日历</h1>
              <span className="rounded-full bg-sage-50 px-2 py-1 text-[10px] font-medium text-sage-700">
                V3 · 24h smart timeline
              </span>
            </div>

            <p className="mt-1 text-sm text-ink-faint">
              安排时间，而不是被固定工作时段限制。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!showFullDay &&
              (visibleStartHour > 0 || visibleEndHour < 24) && (
                <button
                  type="button"
                  onClick={() => setShowFullDay(true)}
                  className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink-soft transition hover:bg-sage-50"
                >
                  显示 24 小时
                </button>
              )}

            {showFullDay && (
              <button
                type="button"
                onClick={() => setShowFullDay(false)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink-soft transition hover:bg-sage-50"
              >
                智能折叠
              </button>
            )}

            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              aria-label="前一天"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-sage-50"
              onClick={() => {
                lastAutoScrolledDateRef.current = null;
                setSelectedDate(initialDate);
              }}
            >
              今天
            </button>

            <button
              type="button"
              className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
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

        <div className={`grid gap-5 ${layoutClass}`}>
          {/* =================================================
              Task pool
          ================================================= */}
          <aside className="card h-fit p-4 xl:sticky xl:top-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">任务池</h2>
                  <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[10px] text-sage-700">
                    {poolTodos.length} 待安排
                  </span>
                </div>

                <p className="mt-1 text-xs leading-5 text-ink-faint">
                  拖到时间轴安排一段工作时间；未排完的任务会继续留在这里。
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
                  仍可继续拖动；超出预计时间只提示，不阻止排期。
                </p>
              </details>
            )}
          </aside>

          {/* =================================================
              Timeline card
          ================================================= */}
          <section className="card min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="font-medium">{formatDateTitle(selectedDate)}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {scheduledSessions.length} 个时间段
                  {scheduledSessions.length > 0 && (
                    <>
                      {" · "}
                      {new Set(scheduledSessions.map(({ todo }) => todo.id)).size}{" "}
                      个任务
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!showFullDay && (
                  <span className="hidden rounded-full bg-black/[0.035] px-3 py-1.5 text-[10px] text-ink-faint sm:block">
                    智能时段 · {String(visibleStartHour).padStart(2, "0")}:00–
                    {String(visibleEndHour).padStart(2, "0")}:00
                  </span>
                )}

                {activeTodo && (
                  <span className="hidden rounded-full bg-sage-50 px-3 py-1.5 text-xs text-sage-700 sm:block">
                    松手后立即落位
                  </span>
                )}
              </div>
            </div>

            {/* Top collapsed quiet hours */}
            {!showFullDay && visibleStartHour > 0 && (
              <QuietHoursBand
                startHour={0}
                endHour={visibleStartHour}
                nowMinutes={nowMinutesForSelectedDate}
                onExpand={() => setShowFullDay(true)}
              />
            )}

            {/* Timeline viewport */}
            <div
              ref={timelineScrollRef}
              className="max-h-[72vh] min-h-[560px] overflow-y-auto overscroll-contain"
            >
              <div
                className="relative"
                style={{
                  height:
                    visibleTotalHeight +
                    TIMELINE_BOTTOM_SPACE +
                    TIMELINE_TOP_PADDING,
                }}
              >
                {/* Hour labels */}
                <div className="pointer-events-none absolute left-0 top-0 h-full w-[68px] border-r border-line bg-white/30">
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className="absolute right-3 -translate-y-1/2 text-[11px] tabular-nums text-ink-faint"
                      style={{
                        top:
                          TIMELINE_TOP_PADDING +
                          index * HOUR_HEIGHT,
                      }}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                <div
                  className="absolute left-[68px] right-0"
                  style={{
                    top: TIMELINE_TOP_PADDING,
                    height: visibleTotalHeight,
                  }}
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

                  {/* Current time indicator
                      完全留在右侧时间网格，不再侵入左边数字刻度。 */}
                  {currentTimeInfo && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                      style={{ top: currentTimeInfo.top }}
                    >
                      <span className="ml-0.5 h-3 w-3 shrink-0 rounded-full bg-[#4f5d4c] ring-[3px] ring-white shadow-md" />
                      <span className="h-[2.5px] flex-1 rounded-full bg-[#7f967a]" />
                      <span className="ml-2 mr-3 inline-flex shrink-0 items-center rounded-full bg-[#3f473f] px-3 py-1.5 text-[11px] font-semibold tabular-nums tracking-[0.02em] text-white shadow-[0_4px_14px_rgba(63,71,63,0.28)] ring-1 ring-black/5">
                        {currentTimeInfo.label}
                        <span className="ml-1.5 text-white/80">现在</span>
                      </span>
                    </div>
                  )}

                  {/* Sessions */}
                  <div className="absolute inset-0">
                    {scheduledSessions.map(({ todo, session }) => (
                      <ScheduledSession
                        key={session.id}
                        todo={todo}
                        session={session}
                        visibleStartHour={visibleStartHour}
                        visibleEndHour={visibleEndHour}
                        selected={selectedSessionId === session.id}
                        justPlaced={justPlacedId === session.id}
                        saving={busyId === session.id}
                        starting={startingFocusTodoId === todo.id}
                        onSelect={() => {
                          if (!activeDragId) {
                            openSelectedSession(session.id);
                          }
                        }}
                        onResize={handleResize}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom collapsed quiet hours */}
            {!showFullDay && visibleEndHour < 24 && (
              <QuietHoursBand
                startHour={visibleEndHour}
                endHour={24}
                nowMinutes={nowMinutesForSelectedDate}
                onExpand={() => setShowFullDay(true)}
              />
            )}

            {busyId && (
              <div className="flex items-center justify-end gap-1.5 border-t border-line bg-paper/60 px-5 py-2 text-[10px] text-ink-faint">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                后台保存中…
              </div>
            )}
          </section>

          {/* =================================================
              Context Panel

              Calendar 不固定永久三栏。
              只有选中 Session 后才出现右侧工作上下文。
          ================================================= */}
          {selectedSessionInfo && (
            <aside className="card min-w-0 overflow-hidden xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-ink">
                      {selectedSessionInfo.todo.title}
                    </p>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] ${categoryOf(
                        selectedSessionInfo.todo
                      ).badge}`}
                    >
                      {categoryOf(selectedSessionInfo.todo).label}
                    </span>
                  </div>

                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatTime(selectedSessionInfo.session.scheduled_start)} –{" "}
                    {formatTime(selectedSessionInfo.session.scheduled_end)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSessionId(null);
                    setEditingTodoId(null);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-faint transition hover:bg-paper hover:text-ink"
                  aria-label="关闭任务详情"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex border-b border-line/70 px-2">
                <ContextTabButton
                  active={contextTab === "overview"}
                  icon={<Clock3 className="h-3.5 w-3.5" />}
                  onClick={() => setContextTab("overview")}
                >
                  概览
                </ContextTabButton>

                <ContextTabButton
                  active={contextTab === "steps"}
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                  onClick={() => setContextTab("steps")}
                >
                  步骤
                </ContextTabButton>

                <ContextTabButton
                  active={contextTab === "notes"}
                  icon={<FileText className="h-3.5 w-3.5" />}
                  onClick={() => setContextTab("notes")}
                >
                  Notes
                </ContextTabButton>
              </div>

              <div className="min-h-0 overflow-y-auto xl:max-h-[calc(100vh-11rem)]">
                {/* -----------------------------------------
                    Overview
                ----------------------------------------- */}
                {contextTab === "overview" && (
                  <div className="space-y-4 p-4">
                    {editingTodoId === selectedSessionInfo.todo.id ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium">编辑任务</p>
                          <p className="mt-1 text-[11px] leading-4 text-ink-faint">
                            这里只编辑任务本体。Session 时间继续通过时间轴拖动 / 拉伸管理。
                          </p>
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

                        <div>
                          <span className="mb-1 block text-xs text-ink-faint">
                            预计时间
                          </span>

                          <DurationInput
                            value={editMinutes}
                            unit={editDurationUnit}
                            onValueChange={setEditMinutes}
                            onUnitChange={setEditDurationUnit}
                            disabled={
                              busyId ===
                              selectedSessionInfo.todo.id
                            }
                          />
                        </div>

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
                      <>
                        {selectedSessionInfo.todo.description && (
                          <div className="rounded-2xl bg-paper/70 px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                              任务说明
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink-soft">
                              {selectedSessionInfo.todo.description}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-2xl border border-line/70 bg-white/60 p-3">
                            <p className="text-[10px] text-ink-faint">本次 Session</p>
                            <p className="mt-1 text-lg font-medium text-ink">
                              {formatMinutes(
                                sessionDurationMinutes(
                                  selectedSessionInfo.session
                                )
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-line/70 bg-white/60 p-3">
                            <p className="text-[10px] text-ink-faint">总已安排</p>
                            <p className="mt-1 text-lg font-medium text-ink">
                              {formatMinutes(
                                scheduledMinutes(selectedSessionInfo.todo)
                              )}
                            </p>
                          </div>
                        </div>

                        {remainingMinutes(selectedSessionInfo.todo) !== null && (
                          <div className="rounded-2xl bg-sage-50 px-4 py-3">
                            <p className="text-[10px] text-sage-700/70">
                              预计剩余
                            </p>
                            <p className="mt-1 text-sm font-medium text-sage-700">
                              {formatMinutes(
                                remainingMinutes(selectedSessionInfo.todo) ?? 0
                              )}
                            </p>
                          </div>
                        )}

                        {/* 提醒 placeholder: V3 layout reserves the place,
                            actual reminder data/global listener is next phase. */}
                        <div className="rounded-2xl border border-dashed border-line bg-white/35 p-3">
                          <div className="flex items-start gap-2.5">
                            <Bell className="mt-0.5 h-4 w-4 text-ink-faint" />
                            <div>
                              <p className="text-xs font-medium text-ink-soft">
                                Reminder
                              </p>
                              <p className="mt-1 text-[10px] leading-4 text-ink-faint">
                                下一阶段接入 Session reminder。这里先保留入口，不写临时逻辑。
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={
                            startingFocusTodoId === selectedSessionInfo.todo.id
                          }
                          onClick={() => openFocus(selectedSessionInfo.todo)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage-100 px-3 py-2.5 text-sm font-medium text-sage-700 transition hover:bg-sage-300/60 disabled:cursor-wait disabled:opacity-70"
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

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(selectedSessionInfo.todo)}
                            className="btn-ghost flex items-center justify-center gap-2 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </button>

                          <button
                            type="button"
                            onClick={() => completeTodo(selectedSessionInfo.todo)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-blush-50 px-3 py-2 text-xs font-medium text-blush-500 transition hover:bg-blush-100"
                          >
                            <Check className="h-3.5 w-3.5" />
                            完成
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeSession(
                              selectedSessionInfo.todo,
                              selectedSessionInfo.session
                            )
                          }
                          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-faint transition hover:bg-blush-50 hover:text-blush-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          取消这一段排期
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* -----------------------------------------
                    Steps
                ----------------------------------------- */}
                {contextTab === "steps" && (
                  <div className="p-4">
                    <TodoSubtasks todoId={selectedSessionInfo.todo.id} />
                  </div>
                )}

                {/* -----------------------------------------
                    Notes

                    QuickNotes 仍然是 Todo-level。
                    同一个 Todo 的多个 Calendar Session 共享一套 Notes。
                ----------------------------------------- */}
                {contextTab === "notes" && (
                  <div className="min-h-[520px]">
                    <QuickNotes
                      todoId={selectedSessionInfo.todo.id}
                      todoTitle={selectedSessionInfo.todo.title}
                    />
                  </div>
                )}
              </div>
            </aside>
          )}
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
