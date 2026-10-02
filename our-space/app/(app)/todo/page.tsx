import { requireGroup } from "@/lib/session";
import {
  formatLongDate,
  todayIn,
  tzOf,
} from "@/lib/utils";

import AddTodoForm from "@/components/AddTodoForm";
import TodoList, {
  type Todo,
} from "@/components/TodoList";

export const dynamic = "force-dynamic";

export default async function TodoPage() {
  const {
    supabase,
    user,
    profile,
    group,
  } = await requireGroup();

  const tz = tzOf(profile);
  const today = todayIn(tz);

  /*
   * Todo 页面显示：
   *
   * 1. 私人 Todo
   * 2. 当前 Space 的 Todo
   *
   * 查询所有日期，
   * 后面再分成：
   * - 今天
   * - 以前没完成
   * - 最近完成
   */
  const { data: todos, error } =
    await supabase
      .from("todos")
      .select(
        `
        id,
        title,
        estimated_minutes,
        status,
        group_id,
        task_date,
        started_at,
        elapsed_seconds,
        completed_at,
        created_at,
        scheduled_start,
        scheduled_end
      `
      )
      .eq("user_id", user.id)
      .or(
        `group_id.is.null,group_id.eq.${group.id}`
      )
      .order("task_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(
      `Failed to load todos: ${error.message}`
    );
  }

  const allTodos = todos ?? [];

  /*
   * 今天未完成
   */
  const todayTodos = allTodos.filter(
    (todo) =>
      todo.task_date === today &&
      todo.status !== "completed"
  );

  /*
   * 今天已完成
   */
  const todayCompleted = allTodos.filter(
    (todo) =>
      todo.task_date === today &&
      todo.status === "completed"
  );

  /*
   * 以前留下来的未完成任务
   */
  const overdueTodos = allTodos.filter(
    (todo) =>
      todo.task_date < today &&
      todo.status !== "completed"
  );

  /*
   * 以前完成的任务
   * 第一版只显示最近 20 条
   */
  const completedHistory = allTodos
    .filter(
      (todo) =>
        todo.task_date < today &&
        todo.status === "completed"
    )
    .slice(0, 20);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold">
          Todo
        </h1>

        <p className="mt-1 text-sm text-ink-faint">
          {formatLongDate(today)}
        </p>

        <p className="mt-1 text-xs text-ink-faint">
          当前 Space：{group.name}
        </p>
      </header>

      {/* 今日进度 */}
      <section className="card mt-8 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-medium">
              今天
            </h2>

            <p className="mt-1 text-xs text-ink-faint">
              一点一点完成就好。
            </p>
          </div>

          <div className="text-right">
            <p className="text-xl font-semibold text-sage-700">
              {todayCompleted.length}
              /
              {todayTodos.length +
                todayCompleted.length}
            </p>

            <p className="text-xs text-ink-faint">
              已完成
            </p>
          </div>
        </div>

        <div className="mt-5">
          <TodoList
            todos={
              todayTodos as Todo[]
            }
          />
        </div>

        {todayCompleted.length > 0 && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-3 text-xs font-medium text-ink-faint">
              今天完成
            </p>

            <TodoList
              todos={
                todayCompleted as Todo[]
              }
            />
          </div>
        )}
      </section>

      {/* 新增任务 */}
      <section className="card mt-6 p-5">
        <div className="mb-5">
          <h2 className="font-medium">
            添加任务
          </h2>

          <p className="mt-1 text-xs text-ink-faint">
            可以设置预计完成时间。
          </p>
        </div>

        <AddTodoForm
          userId={user.id}
          activeSpaceId={group.id}
          activeSpaceName={group.name}
          taskDate={today}
        />
      </section>

      {/* 以前没完成 */}
      {overdueTodos.length > 0 && (
        <section className="card mt-6 p-5">
          <div className="mb-5">
            <h2 className="font-medium">
              之前没完成
            </h2>

            <p className="mt-1 text-xs text-ink-faint">
              不需要一次全部补完。
            </p>
          </div>

          <TodoList
            todos={
              overdueTodos as Todo[]
            }
          />
        </section>
      )}

      {/* 最近完成 */}
      {completedHistory.length > 0 && (
        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-ink-soft">
              最近完成
            </h2>
          </div>

          <div className="opacity-80">
            <TodoList
              todos={
                completedHistory as Todo[]
              }
            />
          </div>

          <p className="mt-4 text-center text-xs text-ink-faint">
            更早的完成记录之后会放进历史日历。
          </p>
        </section>
      )}
    </div>
  );
}
