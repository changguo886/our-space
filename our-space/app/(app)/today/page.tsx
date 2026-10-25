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
import MochiWidget from "@/components/companion/MochiWidget";
import { type Todo } from "@/components/TodoList";
import TaskBoardV2 from "@/components/TaskBoardV2";

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


  let entryMedia:
    {
      id: string;
      media_type:
        | "image"
        | "video";
      section:
        | "today_tasks"
        | "today_note"
        | "tomorrow_plan";
      storage_path: string;
      signed_url: string;
      sort_order: number;
    }[] = [];

  if (entry?.id) {
    const {
      data: mediaRows,
      error: mediaError,
    } = await supabase
      .from("daily_entry_media")
      .select(
        "id, media_type, section, storage_path, sort_order"
      )
      .eq(
        "entry_id",
        entry.id
      )
      .order(
        "sort_order",
        {
          ascending: true,
        }
      );

    if (
      !mediaError &&
      mediaRows &&
      mediaRows.length > 0
    ) {
      const {
        data: signedRows,
      } = await supabase
        .storage
        .from("daily-media")
        .createSignedUrls(
          mediaRows.map(
            (item) =>
              item.storage_path
          ),
          60 * 60
        );

      const signedByPath =
        new Map(
          (signedRows ?? [])
            .filter(
              (item) =>
                item.signedUrl
            )
            .map(
              (item) => [
                item.path,
                item.signedUrl,
              ]
            )
        );

      entryMedia =
        mediaRows
          .map(
            (item) => ({
              ...item,
              media_type:
                item.media_type as
                  | "image"
                  | "video",
              section:
                item.section as
                  | "today_tasks"
                  | "today_note"
                  | "tomorrow_plan",
              signed_url:
                signedByPath.get(
                  item.storage_path
                ) ?? "",
            })
          )
          .filter(
            (item) =>
              Boolean(
                item.signed_url
              )
          );
    }
  }

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
      created_at,
      scheduled_start,
      scheduled_end,
      category,
      color_hex,
      task_type,
      plan_start_date,
      target_finish_date,
      deadline_date,
      custom_tag,
      todo_space_shares ( group_id )
    `)
    .eq(
      "user_id",
      user.id
    )
    // All of the user's tasks: the board decides what belongs to "today"
    // (one-time tasks dated today, projects spanning today, routines due today,
    // anything with a plan today) — same rules as the Tasks page (issue 11).
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


      <div className="mx-auto max-w-[1180px]">
        <TaskBoardV2
          todos={(todos ?? []) as Todo[]}
          today={today}
          userId={user.id}
          activeSpaceId={group.id}
          activeSpaceName={group.name}
          showHeading={false}
        />
      </div>
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
          initialMedia={
            entryMedia
          }
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


      <MochiWidget />

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-ink-faint">
        {todayText.footer}
      </p>
    </div>
  );
}
