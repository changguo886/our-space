import Link from "next/link";
import { MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import ReactionBar from "@/components/ReactionBar";
import { EntryBody } from "@/components/EntryCardBody";
import { nameOf, relativeDay, timeIn, type Profile, type ReactionType } from "@/lib/utils";

export const ENTRY_SELECT =
  "id, user_id, entry_date, today_tasks, today_note, tomorrow_plan, created_at, updated_at, profiles(id, display_name, email, avatar_url), reactions(user_id, reaction_type), comments(count)";

export type EntryMedia = {
  id: string;
  entry_id: string;
  media_type: "image" | "video";
  storage_path: string;
  sort_order: number;
  signed_url: string;
};

export type EntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  today_tasks: string | null;
  today_note: string | null;
  tomorrow_plan: string | null;
  created_at: string;
  updated_at: string;
  profiles: Pick<Profile, "id" | "display_name" | "email" | "avatar_url"> | null;
  reactions: { user_id: string; reaction_type: ReactionType }[];
  comments: { count: number }[];
  media?: EntryMedia[];
};

export { EntryBody };

export function EntryMediaGrid({
  media,
}: {
  media: EntryMedia[];
}) {
  if (media.length === 0) {
    return null;
  }

  if (
    media.length === 1 &&
    media[0].media_type ===
      "video"
  ) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-black/[0.03]">
        <video
          src={media[0].signed_url}
          controls
          preload="metadata"
          className="max-h-[520px] w-full bg-black object-contain"
        />
      </div>
    );
  }

  const count = media.length;
  const gridClass =
    count === 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div
      className={`mt-3 grid gap-1.5 overflow-hidden rounded-2xl ${gridClass}`}
    >
      {media.map(
        (
          item,
          index
        ) => (
          <div
            key={item.id}
            className={`overflow-hidden bg-black/[0.03] ${
              count === 1
                ? "aspect-[4/3]"
                : "aspect-square"
            } ${
              count === 4 &&
              index === 0
                ? ""
                : ""
            }`}
          >
            <img
              src={item.signed_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        )
      )}
    </div>
  );
}

export default function EntryCard({
  entry,
  viewerId,
  viewerTz,
}: {
  entry: EntryRow;
  viewerId: string;
  viewerTz: string;
}) {
  const isOwn = entry.user_id === viewerId;
  const commentCount = entry.comments?.[0]?.count ?? 0;

  return (
    <article className="card p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:gap-5">
        <Link href={`/entry/${entry.id}`} className="flex items-center gap-3 md:w-32 md:shrink-0 md:flex-col md:items-start md:gap-2">
          <Avatar profile={entry.profiles} size={44} />
          <div>
            <p className="font-medium">{nameOf(entry.profiles)}</p>
            <p className="text-xs text-ink-faint">
              {relativeDay(entry.entry_date, viewerTz)} {timeIn(entry.updated_at, viewerTz)}
            </p>
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/entry/${entry.id}`} className="block transition hover:opacity-90">
            <EntryBody entry={entry} tint={isOwn ? "bg-mist-50" : "bg-blush-50"} />
          </Link>

          <EntryMediaGrid
            media={entry.media ?? []}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ReactionBar entryId={entry.id} userId={viewerId} isOwn={isOwn} initial={entry.reactions ?? []} />
            <Link
              href={`/entry/${entry.id}#comments`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              留言{commentCount > 0 && <span className="tabular-nums text-ink-faint">{commentCount}</span>}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
