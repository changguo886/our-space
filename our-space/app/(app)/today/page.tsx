import Link from "next/link";

import { requireGroup } from "@/lib/session";

import {
  formatLongDate,
  nameOf,
  todayIn,
  tzOf,
} from "@/lib/utils";

import EntryForm from "@/components/EntryForm";

import AddTodoForm from "@/components/AddTodoForm";

import TodoList, {
  type Todo,
} from "@/components/TodoList";

import {
  MessageCircle,
} from "lucide-react";

export const dynamic =
  "force-dynamic";

export default async function TodayPage() {
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
   * 今日记录
   */
  const {
    data: entry,
  } = await supabase
    .from(
      "daily_entries"
    )
    .select(
      `
      id,
      today_tasks,
      description,
      today_note,
      tomorrow_plan,
      reactions(reaction_type),
      comments(count)
      `
    )
    .eq(
      "user_id",
      user.id
    )
    .eq(
      "group_id",
      group.id
    )
    .eq(
      "entry_date",
      today
    )
    .maybeSingle();

  /*
   * 今日 Todo
   */
  const {
    data: todos,
  } = await supabase
    .from("todos")
    .select(`
      id,
      title,
      estimated_minutes,
      status,
      group_id,
      task_date,
      scheduled_start,
      scheduled_end,
      category,
      custom_tag
    `)
    .eq(
      "user_id",
      user.id
    )
    .eq(
      "task_date",
      today
    )
    .or(
      `group_id.is.null,group_id.eq.${group.id}`
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  const reactionCount =
    entry?.reactions
      ?.length ?? 0;

  const commentCount =
    (
      entry?.comments as unknown as
        | {
            count: number;
          }[]
        | undefined
    )?.[0]?.count ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Hi,{" "}
            {
              nameOf(
                profile
              )
            }{" "}
            ☀️
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
        </div>

        <form
          action="/auth/signout"
          method="post"
        >
          <button className="btn-ghost text-xs">
            退出
          </button>
        </form>
      </header>

      {/* Todo */}
      <section className="card mt-8 p-5">
        <div>
          <h2 className="text-lg font-medium">
            Todo
          </h2>

          <p className="mt-1 text-xs text-ink-faint">
            给今天安排一点事情。
          </p>
        </div>

        <div className="mt-5">
          <TodoList
            todos={
              (todos ??
                []) as Todo[]
            }
          />
        </div>

        <div className="mt-6 border-t border-line pt-5">
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
        </div>
      </section>

      {/* Daily Entry */}
      <section className="mt-8">
        <EntryForm
          groupId={
            group.id
          }
          userId={
            user.id
          }
          entryDate={
            today
          }
          initial={{
            today_tasks:
              entry
                ?.today_tasks ??
              "",

            today_note:
              entry
                ?.today_note ??
              "",

            tomorrow_plan:
              entry
                ?.tomorrow_plan ??
              "",
          }}
        />
      </section>

      {/* reactions */}
      {entry &&
        (reactionCount >
          0 ||
          commentCount >
            0) && (
          <Link
            href={`/entry/${entry.id}`}
            className="card mt-6 flex items-center justify-between px-5 py-4 text-sm text-ink-soft transition hover:bg-white"
          >
            <span>
              朋友们给了你{" "}
              {
                reactionCount
              }{" "}
              个回应
              {commentCount >
                0 &&
                `、${commentCount} 条留言`}{" "}
              💌
            </span>

            <MessageCircle className="h-4 w-4" />
          </Link>
        )}

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
        写多写少都可以，空着也没关系。
      </p>
    </div>
  );
}
