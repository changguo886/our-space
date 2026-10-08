import Link from "next/link";

import { requireGroup } from "@/lib/session";

import {
  nameOf,
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

import EntryForm from "@/components/EntryForm";
import AddTodoForm from "@/components/AddTodoForm";
import { type Todo } from "@/components/TodoList";
import TodayTodoWorkspace from "@/components/TodayTodoWorkspace";

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

  const preferences =
    await getUserPreferences(
      supabase,
      user.id
    );

  const dictionary =
    getDictionary(
      preferences.language
    );

  const todoText =
    dictionary.todo;

  const todayText =
    dictionary.today;


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


  const {
    data: todos,
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


  const todayTodos =
    (todos ?? []).filter(
      (todo) =>
        todo.status !==
        "completed"
    );

  const todayCompleted =
    (todos ?? []).filter(
      (todo) =>
        todo.status ===
        "completed"
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
    <div className="mx-auto max-w-[1180px]">
      <header className="mx-auto flex max-w-2xl items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {todayText.greeting.replace(
              "{name}",
              nameOf(profile)
            )}
          </h1>

          <p className="mt-1 text-sm text-ink-faint">
            {
              formatYmdLongDate(
                today,
                preferences.language
              )
            }
          </p>

          <p className="mt-1 text-xs text-ink-faint">
            {todoText.currentSpace}
            {group.name}
          </p>
        </div>

        <form
          action="/auth/signout"
          method="post"
        >
          <button className="btn-ghost text-xs">
            {todayText.signOut}
          </button>
        </form>
      </header>


      <TodayTodoWorkspace
        todayTodos={
          todayTodos as Todo[]
        }
        todayCompleted={
          todayCompleted as Todo[]
        }
        title={todoText.title}
        description={todoText.todayPlanDescription}
        showProgress={false}
      />


      <section className="card mx-auto mt-6 max-w-2xl p-5">
        <div className="mb-5">
          <h2 className="font-medium">
            {todoText.addTask}
          </h2>

          <p className="mt-1 text-xs text-ink-faint">
            {todoText.addTaskDescription}
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


      <section className="mx-auto mt-8 max-w-2xl">
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


      {entry &&
        (reactionCount >
          0 ||
          commentCount >
            0) && (
          <Link
            href={`/entry/${entry.id}`}
            className="card mx-auto mt-6 flex max-w-2xl items-center justify-between px-5 py-4 text-sm text-ink-soft transition hover:bg-white"
          >
            <span>
              {todayText.reactions.replace(
                "{reactions}",
                String(reactionCount)
              )}
              {commentCount > 0 &&
                todayText.comments.replace(
                  "{comments}",
                  String(commentCount)
                )}{" "}
              💌
            </span>

            <MessageCircle className="h-4 w-4" />
          </Link>
        )}


      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-ink-faint">
        {todayText.footer}
      </p>
    </div>
  );
}
