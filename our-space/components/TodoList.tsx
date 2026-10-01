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
} from "lucide-react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Todo = {
  id: string;
  title: string;
  estimated_minutes: number | null;
  status: string;
  group_id: string | null;

  // 后面 History / Todo 页面会用到
  task_date?: string;
  started_at?: string | null;
  elapsed_seconds?: number;
  completed_at?: string | null;
};

export default function TodoList({
  todos,
}: {
  todos: Todo[];
}) {
  const router = useRouter();

  // 当前正在编辑哪一个 Todo
  const [editingId, setEditingId] =
    useState<string | null>(null);

  // 编辑中的标题
  const [editTitle, setEditTitle] =
    useState("");

  // 编辑中的预计时间
  const [editMinutes, setEditMinutes] =
    useState("");

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * 完成 / 恢复 Todo
   */
  async function toggleTodo(todo: Todo) {
    if (busyId) return;

    setBusyId(todo.id);
    setError(null);

    const supabase = createClient();

    const completed =
      todo.status === "completed";

    const { error } = await supabase
      .from("todos")
      .update({
        status: completed
          ? "pending"
          : "completed",

        started_at: null,

        completed_at: completed
          ? null
          : new Date().toISOString(),
      })
      .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        "更新任务失败：" + error.message
      );
      return;
    }

    router.refresh();
  }

  /*
   * 进入 Focus 页面
   */
  function openFocus(todoId: string) {
    router.push(`/focus/${todoId}`);
  }

  /*
   * 开始编辑
   */
  function startEditing(todo: Todo) {
    setEditingId(todo.id);

    setEditTitle(todo.title);

    setEditMinutes(
      todo.estimated_minutes
        ? String(todo.estimated_minutes)
        : ""
    );

    setError(null);
  }

  /*
   * 取消编辑
   */
  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
    setEditMinutes("");
    setError(null);
  }

  /*
   * 保存编辑
   */
  async function saveEdit(todoId: string) {
    const cleanTitle =
      editTitle.trim();

    if (!cleanTitle) {
      setError("任务名称不能为空。");
      return;
    }

    const parsedMinutes =
      editMinutes.trim()
        ? Number(editMinutes)
        : null;

    if (
      parsedMinutes !== null &&
      (!Number.isFinite(parsedMinutes) ||
        parsedMinutes <= 0)
    ) {
      setError(
        "预计时间需要是大于 0 的分钟数。"
      );
      return;
    }

    setBusyId(todoId);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .update({
        title: cleanTitle,
        estimated_minutes:
          parsedMinutes,
      })
      .eq("id", todoId);

    setBusyId(null);

    if (error) {
      setError(
        "保存失败：" + error.message
      );
      return;
    }

    setEditingId(null);
    setEditTitle("");
    setEditMinutes("");

    router.refresh();
  }

  /*
   * 删除 Todo
   */
  async function deleteTodo(todo: Todo) {
    const confirmed =
      window.confirm(
        `确定删除「${todo.title}」吗？`
      );

    if (!confirmed) return;

    setBusyId(todo.id);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", todo.id);

    setBusyId(null);

    if (error) {
      setError(
        "删除失败：" + error.message
      );
      return;
    }

    if (editingId === todo.id) {
      cancelEditing();
    }

    router.refresh();
  }

  if (todos.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        今天还没有任务。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-xl bg-blush-50 px-3 py-2 text-sm text-blush-500">
          {error}
        </p>
      )}

      {todos.map((todo) => {
        const completed =
          todo.status === "completed";

        const editing =
          editingId === todo.id;

        const busy =
          busyId === todo.id;

        /*
         * 编辑模式
         */
        if (editing) {
          return (
            <div
              key={todo.id}
              className="rounded-xl border border-sage-200 bg-white p-4"
            >
              <div className="space-y-3">
                {/* 标题 */}
                <div>
                  <label className="mb-1 block text-xs text-ink-faint">
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
                    autoFocus
                    disabled={busy}
                  />
                </div>

                {/* 时间 */}
                <div>
                  <label className="mb-1 block text-xs text-ink-faint">
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
                    placeholder="例如 30"
                    disabled={busy}
                  />
                </div>

                {/* 编辑按钮 */}
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

        /*
         * 普通显示模式
         */
        return (
          <div
            key={todo.id}
            className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition hover:bg-white/60"
          >
            {/* 完成按钮 */}
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

            {/* Todo 信息 */}
            <div className="min-w-0 flex-1">
              <p
                className={
                  completed
                    ? "truncate text-sm text-ink-faint line-through"
                    : "truncate text-sm text-ink"
                }
              >
                {todo.title}
              </p>

              {todo.estimated_minutes && (
                <p className="mt-1 text-xs text-ink-faint">
                  预计{" "}
                  {
                    todo.estimated_minutes
                  }{" "}
                  分钟
                </p>
              )}
            </div>

            {/* 操作区 */}
            <div className="flex shrink-0 items-center gap-1">
              {/* 编辑 */}
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

              {/* 删除 */}
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

              {/* Focus */}
              {!completed && (
                <button
                  type="button"
                  onClick={() =>
                    openFocus(todo.id)
                  }
                  disabled={busy}
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-sage-500 text-white transition hover:bg-sage-600"
                  title="开始专注"
                >
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
