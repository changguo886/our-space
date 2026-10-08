import Link from "next/link";
import { requireGroup } from "@/lib/session";
import { tzOf } from "@/lib/utils";
import EntryCard, { ENTRY_SELECT, type EntryRow } from "@/components/EntryCard";

export const dynamic = "force-dynamic";

const PAGE = 20;

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase, user, profile, group } = await requireGroup();
  const tz = tzOf(profile);
  const page = Math.max(0, Number((await searchParams).page ?? 0) || 0);

  const { data } = await supabase
    .from("daily_entries")
    .select(ENTRY_SELECT)
    .eq("group_id", group.id)
    .order("entry_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE);

  const rows = (data ?? []) as unknown as EntryRow[];
  const hasMore = rows.length > PAGE;
  const entries = rows.slice(0, PAGE);

  const entryIds =
    entries.map(
      (entry) => entry.id
    );

  if (entryIds.length > 0) {
    const {
      data: mediaRows,
      error: mediaError,
    } = await supabase
      .from("daily_entry_media")
      .select(
        "id, entry_id, media_type, section, storage_path, sort_order"
      )
      .in(
        "entry_id",
        entryIds
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
      const paths =
        mediaRows.map(
          (item) =>
            item.storage_path
        );

      const {
        data: signedRows,
      } = await supabase
        .storage
        .from("daily-media")
        .createSignedUrls(
          paths,
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

      for (
        const entry of entries
      ) {
        entry.media =
          mediaRows
            .filter(
              (item) =>
                item.entry_id ===
                entry.id
            )
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
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">朋友们的今天</h1>
        <p className="mt-1 text-sm text-ink-faint">看看大家今天都过得怎么样 💛</p>
      </header>

      <div className="mt-6 space-y-4">
        {entries.length === 0 && (
          <div className="card px-6 py-12 text-center text-sm leading-relaxed text-ink-soft">
            这里还很安静。
            <br />
            写下今天的第一条记录，或者把邀请码（在「设置」里）发给朋友吧。
          </div>
        )}
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} viewerId={user.id} viewerTz={tz} />
        ))}
      </div>

      {(page > 0 || hasMore) && (
        <div className="mt-8 flex justify-center gap-3">
          {page > 0 && (
            <Link href={`/friends?page=${page - 1}`} className="btn-ghost">
              ← 较新的
            </Link>
          )}
          {hasMore && (
            <Link href={`/friends?page=${page + 1}`} className="btn-ghost">
              更早的 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
