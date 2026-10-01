"use client";

import {
  Check,
  Circle,
  Play,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Todo = {
  id: string;
  title: string;
  estimated_minutes: number | null;
  status: string;
  group_id: string | null;
};

export default function TodoList({
  todos,
}: {
  todos: Todo[];
}) {
  const router = useRouter();

  async function toggleTodo(
    todo: Todo
  ) {
    const supabase =
      createClient();

    const completed =
      todo.status === "completed";

    await supabase
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

    router.refresh();
  }

  function openFocus(
    todoId: string
  ) {
    router.push(
      `/focus/${todoId}`
    );
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
      {todos.map((todo) => {
        const completed =
          todo.status ===
          "completed";

        return (
          <div
            key={todo.id}
            className="flex items-center gap-3 rounded-xl border border-line px-4 py-3"
          >
            <button
              type="button"
              onClick={() =>
                toggleTodo(todo)
              }
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

            {!completed && (
              <button
                type="button"
                onClick={() =>
                  openFocus(todo.id)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-500 text-white transition hover:bg-sage-600"
                title="开始专注"
              >
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
