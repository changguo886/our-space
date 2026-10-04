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

import TodayTodoWorkspace from "@/components/TodayTodoWorkspace";


export const dynamic =
  "force-dynamic";


export default async function TodoPage() {
  const {
    supabase,
    user,
    profile,
    group,
  } = await requireGroup();

  const tz =
    tzOf(profile);

  const today =
    todayIn(tz);


  const {
    data: todos,
    error,
  } = await supabase
    .from("todos")
    .select(`
      id,
      title,
      description,
      estimated_minutes,
      status,
      group_id,
      task_date,
      started_at,
      elapsed_seconds,
      completed_at,
      created_at,
      scheduled_start,
      scheduled_end,
      category,
      custom_tag
    `)
    .eq(
      "user_id",
      user.id
    )
    .or(
      `group_id.is.null,group_id.eq.${group.id}`
    )
    .order(
      "task_date",
      {
        ascending: false,
      }
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {
    throw new Error(
      `Failed to load todos: ${error.message}`
    );
  }

  const allTodos =
    todos ?? [];


  const todayTodos =
    allTodos.filter(
      (todo) =>
        todo.task_date ===
          today &&
        todo.status !==
          "completed"
    );


  const todayCompleted =
    allTodos.filter(
      (todo) =>
        todo.task_date ===
          today &&
        todo.status ===
          "completed"
    );


  const overdueTodos =
    allTodos.filter(
      (todo) =>
        todo.task_date <
          today &&
        todo.status !==
          "completed"
    );


  const completedHistory =
    allTodos
      .filter(
        (todo) =>
          todo.task_date <
            today &&
          todo.status ===
            "completed"
      )
      .slice(0, 20);


  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header stays comfortably narrow */}
      <header className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">
          Todo
        </h1>

        <p className="mt-1 text-sm text-ink-faint">
          {
            formatLongDate(
              today
            )
          }
        </p>

        <p className="mt-1 text-xs text-ink-faint">
          当前 Space：
          {group.name}
        </p>
      </header>


      {/*
       * Today workspace:
       * closed  -> normal centered Today card
       * open    -> Today card + independent Quick Notes card
       */}
      <TodayTodoWorkspace
        todayTodos={
          todayTodos as Todo[]
        }
        todayCompleted={
          todayCompleted as Todo[]
        }
      />


      {/* 添加 */}
      <section className="card mx-auto mt-6 max-w-2xl p-5">
        <div className="mb-5">
          <h2 className="font-medium">
            添加任务
          </h2>

          <p className="mt-1 text-xs text-ink-faint">
            创建后也可以再修改分类和排期。
          </p>
        </div>

        <AddTodoForm
          userId={
            user.id
          }
          activeSpaceId={
            group.id
          }
          activeSpaceName={
            group.name
          }
          taskDate={
            today
          }
        />
      </section>


      {/* 以前没完成 */}
      {overdueTodos.length >
        0 && (
        <section className="card mx-auto mt-6 max-w-2xl p-5">
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
      {completedHistory.length >
        0 && (
        <section className="mx-auto mt-8 max-w-2xl">
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
