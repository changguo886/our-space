import { requireGroup } from "@/lib/session";

import {
  todayIn,
  tzOf,
} from "@/lib/utils";

import CalendarPlanner from "@/components/calendar/CalendarPlanner";

export const dynamic =
  "force-dynamic";

export default async function CalendarPage() {
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

  /*
   * Calendar 需要所有还没完成的任务：
   *
   * 1. 私人任务
   * 2. 当前 Space 任务
   *
   * 包括：
   * - 未排期
   * - 已排期
   */
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
      scheduled_start,
      scheduled_end,
      category,
      custom_tag,
      started_at,
      elapsed_seconds
    `)
    .eq(
      "user_id",
      user.id
    )
    .neq(
      "status",
      "completed"
    )
    .or(
      `group_id.is.null,group_id.eq.${group.id}`
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      `Failed to load calendar todos: ${error.message}`
    );
  }

  return (
    <CalendarPlanner
      initialTodos={
        todos ?? []
      }
      initialDate={
        today
      }
    />
  );
}
