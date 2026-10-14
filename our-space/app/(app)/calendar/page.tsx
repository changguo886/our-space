import { requireGroup } from "@/lib/session";

import {
  todayIn,
  tzOf,
} from "@/lib/utils";

import CalendarViews from "@/components/calendar/CalendarViews";

export const dynamic =
  "force-dynamic";

export default async function CalendarPage() {
  const {
    supabase,
    user,
    profile,
  } = await requireGroup();

  const tz =
    tzOf(profile);

  const today =
    todayIn(tz);

  /*
   * Calendar 需要所有还没完成的任务：
   *
   * 自己的全部任务（不论分享到哪个 Space）
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
  color_hex,
  custom_tag,
  started_at,
  elapsed_seconds,
  task_type,
  todo_sessions (
    id,
    scheduled_start,
    scheduled_end,
    reminder_minutes_before,
    mode,
    plan_date,
    planned_minutes,
    window_start,
    window_end
  )
`)
    .eq(
      "user_id",
      user.id
    )
    .neq(
      "status",
      "completed"
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
    <CalendarViews
      initialTodos={
        todos ?? []
      }
      initialDate={
        today
      }
    />
  );
}
