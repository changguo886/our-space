import {
  requireGroup,
} from "@/lib/session";

import {
  todayIn,
  tzOf,
} from "@/lib/utils";

import {
  formatYmdLongDate,
  getDictionary,
} from "@/lib/i18n";

import {
  getUserPreferences,
} from "@/lib/preferences";

import TaskBoardV2 from "@/components/TaskBoardV2";

import type { Todo } from "@/components/TodoList";




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

  const preferences =
    await getUserPreferences(
      supabase,
      user.id
    );

  const dictionary =
    getDictionary(
      preferences.language
    );

  const t =
    dictionary.todo;


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
        custom_tag,
        task_type,
        plan_start_date,
        target_finish_date,
        deadline_date
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
    <div className="mx-auto max-w-[1440px]">
      <TaskBoardV2
        todos={allTodos as Todo[]}
        today={today}
        userId={user.id}
        activeSpaceId={group.id}
        activeSpaceName={group.name}
      />
    </div>
  );
}
