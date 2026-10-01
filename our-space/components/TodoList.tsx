"use client";

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

  async function toggleTodo(todo: Todo) {
    const supabase = createClient();

    const completed = todo.status === "completed";

    await supabase
      .from("todos")
      .update({
        status: completed ? "pending" : "completed",
        completed_at: completed
          ? null
          : new Date().toISOString(),
      })
      .eq("id", todo.id);

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
      {todos.map((todo) => {
        const completed = todo.status === "completed";

        return (
          <button
            key={todo.id}
            type="button"
            onClick={() => toggleTodo(todo)}
            className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left"
          >
            <span className="text-lg">
              {completed ? "✓" : "○"}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={
                  completed
                    ? "text-sm text-ink-faint line-through"
                    : "text-sm text-ink"
                }
              >
                {todo.title}
              </p>

              {todo.estimated_minutes && (
                <p className="mt-1 text-xs text-ink-faint">
                  预计 {todo.estimated_minutes} 分钟
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
