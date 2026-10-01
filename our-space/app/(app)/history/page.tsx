import { requireGroup } from "@/lib/session";
import { todayIn, tzOf } from "@/lib/utils";

import HistoryView, {
  type HistoryEntry,
  type HistoryTodo,
} from "@/components/HistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const {
    supabase,
    user,
    profile,
    group,
  } = await requireGroup();

  const today = todayIn(
    tzOf(profile)
  );

  // 当前 Space 的日记历史
  const { data: entries } =
    await supabase
      .from("daily_entries")
      .select(
        "id, entry_date, today_tasks, today_note, tomorrow_plan"
      )
      .eq("user_id", user.id)
      .eq(
        "group_id",
        group.id
      )
      .order(
        "entry_date",
        {
          ascending: false,
        }
      );

  // Todo 历史
  //
  // 包括：
  // - private Todo
  // - 当前 Space Todo
  //
  // 不读取其他 Space 的 Todo
  const { data: todos } =
    await supabase
      .from("todos")
      .select(`
        id,
        title,
        task_date,
        status,
        estimated_minutes,
        elapsed_seconds,
        completed_at,
        group_id
      `)
      .eq("user_id", user.id)
      .or(
        `group_id.is.null,group_id.eq.${group.id}`
      )
      .order(
        "task_date",
        {
          ascending: false,
        }
      );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">
        我的历史记录
      </h1>

      <p className="mt-1 text-xs text-ink-faint">
        当前 Space：
        {group.name}
      </p>

      <HistoryView
        entries={
          (entries ??
            []) as HistoryEntry[]
        }
        todos={
          (todos ??
            []) as HistoryTodo[]
        }
        today={today}
      />
    </div>
  );
}
