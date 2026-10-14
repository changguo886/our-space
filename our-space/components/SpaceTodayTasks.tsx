import Avatar from "@/components/Avatar";
import LinkifiedText from "@/components/LinkifiedText";
import { nameOf, type Profile } from "@/lib/utils";

/** One row of get_space_shared_tasks(). Progress fields are null unless the owner shares progress. */
export type SharedTaskRow = {
  todo_id: string;
  owner_id: string;
  title: string;
  task_type: "one_time" | "project" | "routine";
  task_date: string | null;
  plan_start_date: string | null;
  target_finish_date: string | null;
  color_hex: string | null;
  description: string | null;
  routine_period: "day" | "week" | "month" | null;
  routine_target: number | null;
  routine_weekdays: number[] | null;
  share_progress: boolean;
  completed: boolean | null;
  today_count: number | null;
  focus_minutes: number | null;
};

export type SpaceMember = Pick<Profile, "id" | "display_name" | "email" | "avatar_url">;

const PER_MEMBER = 5;

function typeLabel(row: SharedTaskRow): string {
  if (row.task_type === "routine") {
    const period = row.routine_period === "day" ? "每天" : row.routine_period === "month" ? "每月" : "每周";
    return row.routine_target ? `${period} ${row.routine_target} 次` : "周期任务";
  }
  if (row.task_type === "project") {
    return row.target_finish_date ? `长期项目 · 目标 ${row.target_finish_date.slice(5).replace("-", "/")}` : "长期项目";
  }
  return "单次任务";
}

function TaskLine({ row }: { row: SharedTaskRow }) {
  const done = row.completed === true;
  return (
    <li className="flex gap-3 py-2">
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: row.color_hex ?? "#B7C4B1" }}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${done ? "text-ink-faint line-through" : "text-ink"}`}>{row.title}</p>
        <p className="flex flex-wrap gap-x-1.5 text-xs text-ink-faint">
          <span>{typeLabel(row)}</span>
          {row.share_progress && row.task_type === "routine" && (
            <span>· 今天 {row.today_count ?? 0} 次</span>
          )}
          {row.share_progress && row.task_type !== "routine" && done && <span>· 已完成</span>}
          {row.share_progress && (row.focus_minutes ?? 0) > 0 && <span>· 专注 {row.focus_minutes} 分钟</span>}
        </p>
        {row.description && (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-xs text-ink-soft"><LinkifiedText text={row.description} /></p>
        )}
      </div>
      {done && <span className="shrink-0 text-xs text-sage-700">✓</span>}
    </li>
  );
}

export default function SpaceTodayTasks({
  rows,
  members,
  viewerId,
}: {
  rows: SharedTaskRow[];
  members: SpaceMember[];
  viewerId: string;
}) {
  const byOwner = new Map<string, SharedTaskRow[]>();
  for (const row of rows) {
    const list = byOwner.get(row.owner_id) ?? [];
    list.push(row);
    byOwner.set(row.owner_id, list);
  }
  const owners = members.filter((member) => byOwner.has(member.id));

  if (owners.length === 0) {
    return <p className="card px-5 py-6 text-center text-sm text-ink-soft">今天还没有人分享任务。</p>;
  }

  return (
    <div className="space-y-3">
      {owners.map((member) => {
        const list = byOwner.get(member.id)!;
        const shown = list.slice(0, PER_MEMBER);
        const rest = list.slice(PER_MEMBER);
        return (
          <section key={member.id} className="card px-5 py-3">
            <header className="flex items-center gap-2 pb-1">
              <Avatar profile={member} size={24} />
              <span className="text-sm font-medium text-ink">
                {member.id === viewerId ? "我" : nameOf(member)}
              </span>
              <span className="text-xs text-ink-faint">{list.length} 项</span>
            </header>
            <ul className="divide-y divide-line">
              {shown.map((row) => <TaskLine key={row.todo_id} row={row} />)}
            </ul>
            {rest.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none py-1.5 text-xs text-ink-faint hover:text-ink-soft">
                  <span className="group-open:hidden">展开其余 {rest.length} 项</span>
                  <span className="hidden group-open:inline">收起</span>
                </summary>
                <ul className="divide-y divide-line">
                  {rest.map((row) => <TaskLine key={row.todo_id} row={row} />)}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
