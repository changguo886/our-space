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
  section:
    | "today_tasks"
    | "today_note"
    | "tomorrow_plan";
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
    <article className="card px-4 py-3.5 md:px-5">
      <header className="flex items-center gap-2.5">
        <Link href={`/entry/${entry.id}`} className="shrink-0" aria-label="查看这篇日记">
          <Avatar profile={entry.profiles} size={32} />
        </Link>
        <Link href={`/entry/${entry.id}`} className="flex min-w-0 items-baseline gap-2 hover:opacity-80">
          <span className="truncate text-sm font-medium">{nameOf(entry.profiles)}</span>
          <span className="shrink-0 text-xs text-ink-faint">
            {relativeDay(entry.entry_date, viewerTz)} {timeIn(entry.updated_at, viewerTz)}
          </span>
        </Link>
      </header>

      {/* Not wrapped in a link: the body holds clickable links and image thumbnails. */}
      <div className="mt-2.5">
        <EntryBody entry={entry} tint={isOwn ? "bg-mist-50" : "bg-blush-50"} media={entry.media ?? []} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ReactionBar entryId={entry.id} userId={viewerId} isOwn={isOwn} initial={entry.reactions ?? []} size="xs" />
        <Link
          href={`/entry/${entry.id}#comments`}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-white/70 px-2.5 py-1 text-xs text-ink-soft transition hover:bg-white"
        >
          <MessageCircle className="h-3 w-3" />
          留言{commentCount > 0 && <span className="tabular-nums text-ink-faint">{commentCount}</span>}
        </Link>
      </div>
    </article>
  );
}
