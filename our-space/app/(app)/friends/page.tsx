import Link from "next/link";
import { requireGroup } from "@/lib/session";
import { todayIn, tzOf } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import SpaceTodayTasks, { type SharedTaskRow, type SpaceMember } from "@/components/SpaceTodayTasks";
import EntryCard, { ENTRY_SELECT, type EntryRow } from "@/components/EntryCard";

export const dynamic = "force-dynamic";

const PAGE = 20;

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; member?: string }>;
}) {
  const { supabase, user, profile, group } = await requireGroup();
  const tz = tzOf(profile);
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);

  // 成员（最多 10 人）与今天分享的任务：任务只能通过 get_space_shared_tasks 读取
  const [{ data: memberRows }, { data: sharedRows, error: sharedError }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, joined_at, profiles ( id, display_name, email, avatar_url )")
      .eq("group_id", group.id)
      .order("joined_at", { ascending: true }),
    supabase.rpc("get_space_shared_tasks", { p_group_id: group.id, p_date: todayIn(tz) }),
  ]);
  const members: SpaceMember[] = (memberRows ?? [])
    .map((row) => row.profiles as unknown as SpaceMember | null)
    .filter((member): member is SpaceMember => Boolean(member));
  const memberFilter = members.some((member) => member.id === params.member) ? params.member! : null;
  const sharedTasks = ((sharedRows ?? []) as SharedTaskRow[]).filter(
    (row) => !memberFilter || row.owner_id === memberFilter
  );
  const qs = (next: { page?: number; member?: string | null }) => {
    const search = new URLSearchParams();
    const m = next.member === undefined ? memberFilter : next.member;
    if (m) search.set("member", m);
    if (next.page) search.set("page", String(next.page));
    const text = search.toString();
    return text ? `/friends?${text}` : "/friends";
  };

  let entryQuery = supabase
    .from("daily_entries")
    .select(ENTRY_SELECT)
    .eq("group_id", group.id);
  if (memberFilter) entryQuery = entryQuery.eq("user_id", memberFilter);
  const { data } = await entryQuery
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

      {members.length > 1 && (
        <nav aria-label="按成员筛选" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <Link
            href={qs({ member: null })}
            aria-current={!memberFilter ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${!memberFilter ? "border-sage-400 bg-sage-50 text-sage-700" : "border-line bg-white text-ink-soft"}`}
          >
            全部
          </Link>
          {members.map((member) => (
            <Link
              key={member.id}
              href={qs({ member: member.id })}
              aria-current={memberFilter === member.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs ${memberFilter === member.id ? "border-sage-400 bg-sage-50 text-sage-700" : "border-line bg-white text-ink-soft"}`}
            >
              <Avatar profile={member} size={22} />
              {member.id === user.id ? "我" : member.display_name || member.email?.split("@")[0] || "朋友"}
            </Link>
          ))}
        </nav>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-ink-soft">今天分享的任务</h2>
        {sharedError ? (
          <p className="card px-5 py-6 text-center text-sm text-ink-soft">暂时读取不到分享的任务。</p>
        ) : (
          <SpaceTodayTasks rows={sharedTasks} members={members} viewerId={user.id} />
        )}
      </section>

      <h2 className="mt-8 text-sm font-medium text-ink-soft">日记</h2>

      <div className="mt-3 space-y-3">
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
            <Link href={qs({ page: page - 1 })} className="btn-ghost">
              ← 较新的
            </Link>
          )}
          {hasMore && (
            <Link href={qs({ page: page + 1 })} className="btn-ghost">
              更早的 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
