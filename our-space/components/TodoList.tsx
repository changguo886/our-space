"use client";

import { useState } from "react";

import {
  Check,
  Circle,
  Play,
  Pencil,
  Trash2,
  X,
  Save,
  Clock3,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import TodoSubtasks, {
  type TodoSubtask,
} from "@/components/TodoSubtasks";


/* =========================================================
   Types
========================================================= */

export type TodoCategory =
  | "work"
  | "study"
  | "life"
  | "rest"
  | "other";


export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  estimated_minutes: number | null;
  status: string;
  group_id: string | null;
  task_date?: string;
  started_at?: string | null;
  elapsed_seconds?: number;
  completed_at?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  category?: TodoCategory | null;
  custom_tag?: string | null;
};


export type TodoNotesOpenPayload = {
  todoId: string;
  todoTitle: string;
  targetSubtaskId?: string | null;
};


type TodoListProps = {
  todos: Todo[];

  /*
   * 打开右侧 Quick Notes Panel。
   */
  onOpenNotes?: (
    payload: TodoNotesOpenPayload
  ) => void;

  /*
   * 关键：把某个 Todo 最新的 subtasks 往更高层同步。
   *
   * TodayTodoWorkspace 会保存这些数据，
   * 再直接传给右侧 QuickNotes。
   */
  onSubtasksChange?: (
    todoId: string,
    subtasks: TodoSubtask[]
  ) => void;
};


/* =========================================================
   Category UI config
========================================================= */

const CATEGORIES: {
  value: TodoCategory;
  label: string;
  selectedClass: string;
  badgeClass: string;
}[] = [
  {
    value: "work",
    label: "工作",
    selectedClass:
      "border-mist-500 bg-mist-100 text-mist-500",
    badgeClass:
      "bg-mist-100 text-mist-500",
  },
  {
    value: "study",
    label: "学习",
    selectedClass:
      "border-sage-500 bg-sage-100 text-sage-700",
    badgeClass:
      "bg-sage-100 text-sage-700",
  },
  {
    value: "life",
    label: "生活",
    selectedClass:
      "border-amber-300 bg-amber-50 text-amber-700",
    badgeClass:
      "bg-amber-50 text-amber-700",
  },
  {
    value: "rest",
    label: "休息",
    selectedClass:
      "border-blush-500 bg-blush-100 text-blush-500",
    badgeClass:
      "bg-blush-100 text-blush-500",
  },
  {
    value: "other",
    label: "其他",
    selectedClass:
      "border-ink-faint bg-black/[0.04] text-ink-soft",
    badgeClass:
      "bg-black/[0.04] text-ink-soft",
  },
];


function toLocalInputValue(
  iso?: string | null
) {
  if (!iso) return "";

  const date =
    new Date(iso);

  const offset =
    date.getTimezoneOffset() *
    60000;

  return new Date(
    date.getTime() - offset
  )
    .toISOString()
    .slice(0, 16);
}


function formatScheduledTime(
  start?: string | null,
  end?: string | null
) {
  if (!start) return null;

  const formatter =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );

  const startDate =
    new Date(start);

  const startText =
    formatter.format(
      startDate
    );

  if (!end) {
    return startText;
  }

  const endDate =
    new Date(end);

  const endText =
    formatter.format(
      endDate
    );

  const sameDay =
    startDate.getFullYear() ===
      endDate.getFullYear() &&
    startDate.getMonth() ===
      endDate.getMonth() &&
    startDate.getDate() ===
      endDate.getDate();

  return sameDay
    ? `${startText} – ${endText}`
    : `${startText} – ${endText} 次日`;
}


function statusInfo(
  status: string
) {
  switch (status) {
    case "running":
      return {
        label: "进行中",
        className:
          "bg-sage-100 text-sage-700",
      };

    case "paused":
      return {
        label: "已暂停",
        className:
          "bg-amber-50 text-amber-700",
      };

    case "completed":
      return {
        label: "已完成",
        className:
          "bg-mist-100 text-mist-500",
      };

    default:
      return {
        label: "待开始",
        className:
          "bg-black/[0.04] text-ink-faint",
      };
  }
}


function categoryInfo(
  category?: TodoCategory | null,
  customTag?: string | null
) {
  if (!category) {
    return null;
  }

  const config =
    CATEGORIES.find(
      (item) =>
        item.value === category
    );

  if (!config) {
    return null;
  }

  return {
    label:
      category === "other" &&
      customTag?.trim()
        ? customTag.trim()
        : config.label,

    className:
      config.badgeClass,
  };
}


/* =========================================================
   Main component
========================================================= */

export default function TodoList({
  todos,
  onOpenNotes,
  onSubtasksChange,
}: TodoListProps) {
  const router =
    useRouter();

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(null);

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    editDescription,
    setEditDescription,
  ] = useState("");

  const [
    editMinutes,
    setEditMinutes,
  ] = useState("");

  const [
    editCategory,
    setEditCategory,
  ] =
    useState<TodoCategory | null>(
      null
    );

  const [
    editCustomTag,
    setEditCustomTag,
  ] = useState("");

  const [
    editScheduledStart,
    setEditScheduledStart,
  ] = useState("");

  const [
    editScheduledEnd,
    setEditScheduledEnd,
  ] = useState("");

  const [
    busyId,
    setBusyId,
  ] = useState<string | null>(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  /*
   * 当前只展开一个 Todo 的 checklist。
   */
  const [
    expandedSubtasksId,
    setExpandedSubtasksId,
  ] = useState<string | null>(null);


  function toggleSubtasks(
    todoId: string
  ) {
    setExpandedSubtasksId(
      (current) =>
        current === todoId
          ? null
          : todoId
    );
  }


  /* =======================================================
     Todo status
  ======================================================= */

  async function toggleTodo(
    todo: Todo
  ) {
    if (busyId) return;

    setBusyId(todo.id);
    setError(null);

    const supabase =
      createClient();

    const completed =
      todo.status ===
      "completed";

    const { error } =
      await supabase
        .from("todos")
        .update({
          status: completed
            ? "pending"
            : "completed",

          started_at: null,

          completed_at:
            completed
              ? null
              : new Date().toISOString(),
        })
        .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        "更新任务失败：" +
          error.message
      );

      return;
    }

    router.refresh();
  }


  function openFocus(
    todoId: string
  ) {
    router.push(
      `/focus/${todoId}`
    );
  }


  /* =======================================================
     Todo edit
  ======================================================= */

  function startEditing(
    todo: Todo
  ) {
    setEditingId(todo.id);
    setEditTitle(todo.title);

    setEditDescription(
      todo.description ?? ""
    );

    setEditMinutes(
      todo.estimated_minutes
        ? String(
            todo.estimated_minutes
          )
        : ""
    );

    setEditCategory(
      todo.category ?? null
    );

    setEditCustomTag(
      todo.custom_tag ?? ""
    );

    setEditScheduledStart(
      toLocalInputValue(
        todo.scheduled_start
      )
    );

    setEditScheduledEnd(
      toLocalInputValue(
        todo.scheduled_end
      )
    );

    setError(null);
  }


  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditMinutes("");
    setEditCategory(null);
    setEditCustomTag("");
    setEditScheduledStart("");
    setEditScheduledEnd("");
    setError(null);
  }


  async function saveEdit(
    todoId: string
  ) {
    const cleanTitle =
      editTitle.trim();

    if (!cleanTitle) {
      setError(
        "任务名称不能为空。"
      );
      return;
    }

    const parsedMinutes =
      editMinutes.trim()
        ? Number(editMinutes)
        : null;

    if (
      parsedMinutes !== null &&
      (
        !Number.isFinite(
          parsedMinutes
        ) ||
        parsedMinutes <= 0
      )
    ) {
      setError(
        "预计时间需要是大于 0 的分钟数。"
      );
      return;
    }

    if (
      editScheduledStart &&
      editScheduledEnd
    ) {
      const start =
        new Date(
          editScheduledStart
        );

      const end =
        new Date(
          editScheduledEnd
        );

      if (end <= start) {
        setError(
          "结束时间需要晚于开始时间。"
        );
        return;
      }
    }

    setBusyId(todoId);
    setError(null);

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .update({
          title: cleanTitle,

          description:
            editDescription.trim()
              ? editDescription.trim()
              : null,

          estimated_minutes:
            parsedMinutes,

          category:
            editCategory,

          custom_tag:
            editCategory ===
              "other" &&
            editCustomTag.trim()
              ? editCustomTag.trim()
              : null,

          scheduled_start:
            editScheduledStart
              ? new Date(
                  editScheduledStart
                ).toISOString()
              : null,

          scheduled_end:
            editScheduledEnd
              ? new Date(
                  editScheduledEnd
                ).toISOString()
              : null,
        })
        .eq("id", todoId);

    setBusyId(null);

    if (error) {
      setError(
        "保存失败：" +
          error.message
      );
      return;
    }

    cancelEditing();
    router.refresh();
  }


  /* =======================================================
     Todo delete
  ======================================================= */

  async function deleteTodo(
    todo: Todo
  ) {
    const confirmed =
      window.confirm(
        `确定删除「${todo.title}」吗？`
      );

    if (!confirmed) {
      return;
    }

    setBusyId(todo.id);
    setError(null);

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .delete()
        .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        "删除失败：" +
          error.message
      );
      return;
    }

    if (
      editingId === todo.id
    ) {
      cancelEditing();
    }

    router.refresh();
  }


  if (todos.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        这里还没有任务。
      </p>
    );
  }


  return (
    <div className="min-w-0 space-y-2">
      {error && (
        <p className="rounded-xl bg-blush-50 px-3 py-2 text-sm text-blush-500">
          {error}
        </p>
      )}


      {todos.map((todo) => {
        const completed =
          todo.status ===
          "completed";

        const editing =
          editingId === todo.id;

        const busy =
          busyId === todo.id;

        const status =
          statusInfo(todo.status);

        const category =
          categoryInfo(
            todo.category,
            todo.custom_tag
          );

        const scheduledTime =
          formatScheduledTime(
            todo.scheduled_start,
            todo.scheduled_end
          );


        /* =================================================
           Edit card
        ================================================= */

        if (editing) {
          return (
            <div
              key={todo.id}
              className="rounded-2xl border border-sage-300 bg-white p-5 shadow-soft"
            >
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs text-ink-faint">
                    任务名称
                  </label>

                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) =>
                      setEditTitle(
                        e.target.value
                      )
                    }
                    disabled={busy}
                    autoFocus
                  />
                </div>


                <div>
                  <label className="mb-1.5 block text-xs text-ink-faint">
                    任务细节
                  </label>

                  <textarea
                    className="input min-h-[100px] w-full resize-y"
                    value={
                      editDescription
                    }
                    onChange={(e) =>
                      setEditDescription(
                        e.target.value
                      )
                    }
                    placeholder="写一点具体目标、步骤或备注……"
                    disabled={busy}
                  />
                </div>


                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs text-ink-faint">
                      分类
                    </label>

                    {editCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditCategory(
                            null
                          );
                          setEditCustomTag(
                            ""
                          );
                        }}
                        className="text-[11px] text-ink-faint hover:text-ink-soft"
                      >
                        清除
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(
                      (item) => {
                        const selected =
                          editCategory ===
                          item.value;

                        return (
                          <button
                            key={
                              item.value
                            }
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditCategory(
                                item.value
                              );

                              if (
                                item.value !==
                                "other"
                              ) {
                                setEditCustomTag(
                                  ""
                                );
                              }
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              selected
                                ? item.selectedClass
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


                {editCategory ===
                  "other" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-ink-faint">
                      自定义标签
                    </label>

                    <input
                      className="input"
                      placeholder="比如：健身 / 创作 / 社交"
                      value={
                        editCustomTag
                      }
                      onChange={(e) =>
                        setEditCustomTag(
                          e.target.value
                        )
                      }
                      disabled={busy}
                    />
                  </div>
                )}


                <div>
                  <label className="mb-1.5 block text-xs text-ink-faint">
                    预计时间（分钟）
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={editMinutes}
                    onChange={(e) =>
                      setEditMinutes(
                        e.target.value
                      )
                    }
                    placeholder="例如 45"
                    disabled={busy}
                  />
                </div>


                <div>
                  <p className="mb-2 text-xs text-ink-faint">
                    日程安排
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[11px] text-ink-faint">
                        开始
                      </label>

                      <input
                        className="input"
                        type="datetime-local"
                        value={
                          editScheduledStart
                        }
                        onChange={(e) =>
                          setEditScheduledStart(
                            e.target.value
                          )
                        }
                        disabled={busy}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] text-ink-faint">
                        结束
                      </label>

                      <input
                        className="input"
                        type="datetime-local"
                        value={
                          editScheduledEnd
                        }
                        onChange={(e) =>
                          setEditScheduledEnd(
                            e.target.value
                          )
                        }
                        disabled={busy}
                      />
                    </div>
                  </div>
                </div>


                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={
                      cancelEditing
                    }
                    disabled={busy}
                    className="btn-ghost flex items-center gap-1.5 text-sm"
                  >
                    <X className="h-4 w-4" />
                    取消
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      saveEdit(todo.id)
                    }
                    disabled={busy}
                    className="btn-primary flex items-center gap-1.5 text-sm"
                  >
                    <Save className="h-4 w-4" />
                    {busy
                      ? "保存中…"
                      : "保存"}
                  </button>
                </div>
              </div>
            </div>
          );
        }


        /* =================================================
           Normal Todo card
        ================================================= */

        return (
          <div
            key={todo.id}
            className="group rounded-2xl border border-line bg-white/50 transition hover:bg-white"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  toggleTodo(todo)
                }
                disabled={busy}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                title={
                  completed
                    ? "标记为未完成"
                    : "标记完成"
                }
              >
                {completed ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <Circle className="h-6 w-6 text-ink-faint" />
                )}
              </button>


              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={
                      completed
                        ? "truncate text-sm text-ink-faint line-through"
                        : "truncate text-sm font-medium text-ink"
                    }
                  >
                    {todo.title}
                  </p>

                  {category && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${category.className}`}
                    >
                      {category.label}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>


                {todo.description && (
                  <p
                    className={`mt-1 line-clamp-2 text-xs leading-relaxed ${
                      completed
                        ? "text-ink-faint"
                        : "text-ink-soft"
                    }`}
                  >
                    {todo.description}
                  </p>
                )}


                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                  {todo.estimated_minutes && (
                    <span>
                      预计{" "}
                      {todo.estimated_minutes}{" "}
                      分钟
                    </span>
                  )}

                  {scheduledTime && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {scheduledTime}
                    </span>
                  )}

                  {!scheduledTime &&
                    !completed && (
                    <span>
                      未排期
                    </span>
                  )}
                </div>


                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleSubtasks(
                        todo.id
                      )
                    }
                    className="text-xs font-medium text-sage-700 transition hover:text-sage-500"
                  >
                    {expandedSubtasksId ===
                    todo.id
                      ? "收起任务步骤 ↑"
                      : "拆分任务 ↓"}
                  </button>
                </div>
              </div>


              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    startEditing(todo)
                  }
                  disabled={busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
                  title="编辑任务"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteTodo(todo)
                  }
                  disabled={busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-blush-50 hover:text-blush-500"
                  title="删除任务"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {!completed && (
                  <button
                    type="button"
                    onClick={() =>
                      openFocus(todo.id)
                    }
                    disabled={busy}
                    className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-sage-500 text-white transition hover:bg-sage-700"
                    title="开始专注"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                )}
              </div>
            </div>


            {expandedSubtasksId ===
              todo.id && (
              <div className="border-t border-line px-4 py-4">
                <TodoSubtasks
                  todoId={todo.id}

                  onOpenNotes={
                    (subtaskId) =>
                      onOpenNotes?.({
                        todoId:
                          todo.id,
                        todoTitle:
                          todo.title,
                        targetSubtaskId:
                          subtaskId ??
                          null,
                      })
                  }

                  /*
                   * 关键桥接：
                   * TodoSubtasks -> TodoList -> Workspace
                   */
                  onSubtasksChange={
                    (subtasks) =>
                      onSubtasksChange?.(
                        todo.id,
                        subtasks
                      )
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
