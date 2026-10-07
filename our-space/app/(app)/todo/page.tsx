import {
  requireGroup,
} from "@/lib/session";

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

import OverdueTodoList from "@/components/OverdueTodoList";


export const dynamic =
  "force-dynamic";


export default async function TodoPage() {
  const {
    supabase,
    user,
    profile,
    group,
  } =
    await requireGroup();


  const tz =
    tzOf(
      profile
    );


  /*
   * “今天”仍然使用用户 profile 的时区。
   *
   * 后面的「移到今天」也使用这个日期，
   * 而不是浏览器临时计算日期。
   */
  const today =
    todayIn(
      tz
    );


  const {
    data:
      todos,

    error,
  } =
    await supabase
      .from(
        "todos"
      )
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
          ascending:
            false,
        }
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );


  if (error) {
    throw new Error(
      `Failed to load todos: ${error.message}`
    );
  }


  const allTodos =
    todos ?? [];


  /* =======================================================
     Today
  ======================================================= */

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


  /* =======================================================
     Overdue
  ======================================================= */

  const overdueTodos =
    allTodos.filter(
      (todo) =>
        todo.task_date <
          today &&
        todo.status !==
          "completed"
    );


  /* =======================================================
     Completed history
  ======================================================= */

  const completedHistory =
    allTodos
      .filter(
        (todo) =>
          todo.task_date <
            today &&
          todo.status ===
            "completed"
      )
      .slice(
        0,
        20
      );


  return (
    <div className="mx-auto max-w-[1180px]">
      {/* =================================================
          Page Header
      ================================================= */}

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


      {/* =================================================
          Today Workspace
      ================================================= */}

      <TodayTodoWorkspace
        todayTodos={
          todayTodos as Todo[]
        }
        todayCompleted={
          todayCompleted as Todo[]
        }
      />


      {/* =================================================
          Add Todo
      ================================================= */}

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


      {/* =================================================
          Overdue Todos

          这里现在使用专门的 OverdueTodoList。

          用户可以点击：
          「移到今天」

          数据库只会更新：
          todos.task_date

          Calendar session / Focus time 都不会改变。
      ================================================= */}

      {overdueTodos.length >
        0 && (
        <section className="card mx-auto mt-6 max-w-2xl p-5">
          <div className="mb-5">
            <h2 className="font-medium">
              之前没完成
            </h2>

            <p className="mt-1 text-xs text-ink-faint">
              不需要一次全部补完。想继续做的任务可以直接移到今天。
            </p>
          </div>


          <OverdueTodoList
            todos={
              overdueTodos as Todo[]
            }
            todayDate={
              today
            }
          />
        </section>
      )}


      {/* =================================================
          Completed History
      ================================================= */}

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