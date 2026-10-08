import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireGroup } from "@/lib/session";
import { formatLongDate, nameOf, timeIn, tzOf } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import ReactionBar from "@/components/ReactionBar";
import CommentSection, { type CommentRow } from "@/components/CommentSection";
import {
  ENTRY_SELECT,
  EntryBody,
  EntryMediaGrid,
  type EntryRow,
} from "@/components/EntryCard";

export const dynamic = "force-dynamic";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, user, profile } = await requireGroup();
  const tz = tzOf(profile);

  // RLS 会保证：不是同一小组的记录，这里根本查不到
  const [{ data: entryData }, { data: commentData }] = await Promise.all([
    supabase.from("daily_entries").select(ENTRY_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("comments")
      .select("id, user_id, content, created_at, profiles(id, display_name, email, avatar_url)")
      .eq("entry_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (!entryData) notFound();

  const entry = entryData as unknown as EntryRow;

  const {
    data: mediaRows,
    error: mediaError,
  } = await supabase
    .from("daily_entry_media")
    .select(
      "id, entry_id, media_type, storage_path, sort_order"
    )
    .eq("entry_id", id)
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

    entry.media =
      mediaRows
        .map(
          (item) => ({
            ...item,
            media_type:
              item.media_type as
                | "image"
                | "video",
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

  const isOwn = entry.user_id === user.id;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={isOwn ? "/history" : "/friends"} className="btn-ghost -ml-3">
        <ChevronLeft className="h-4 w-4" />
        返回
      </Link>

      <article className="card mt-3 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <Avatar profile={entry.profiles} size={48} />
          <div>
            <p className="font-medium">{nameOf(entry.profiles)}</p>
            <p className="text-xs text-ink-faint">
              {formatLongDate(entry.entry_date)} · {timeIn(entry.updated_at, tz)}
            </p>
          </div>
          {isOwn && (
            <span className="ml-auto rounded-full bg-sage-50 px-2.5 py-1 text-xs text-sage-700">我的</span>
          )}
        </div>

        <div className="mt-5">
          <EntryBody entry={entry} tint={isOwn ? "bg-mist-50" : "bg-blush-50"} />
          <EntryMediaGrid
            media={entry.media ?? []}
          />
        </div>

        <div className="mt-4">
          <ReactionBar entryId={entry.id} userId={user.id} isOwn={isOwn} initial={entry.reactions ?? []} size="md" />
          {isOwn && (entry.reactions?.length ?? 0) === 0 && (
            <p className="text-xs text-ink-faint">朋友们的回应会出现在这里</p>
          )}
        </div>
      </article>

      <CommentSection
        entryId={entry.id}
        userId={user.id}
        viewerTz={tz}
        initial={(commentData ?? []) as unknown as CommentRow[]}
      />
    </div>
  );
}
