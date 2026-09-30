import Link from "next/link";
import { requireGroup } from "@/lib/session";
import { formatLongDate, nameOf, todayIn, tzOf } from "@/lib/utils";
import EntryForm from "@/components/EntryForm";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { supabase, user, profile, group } = await requireGroup();
  const tz = tzOf(profile);
  const today = todayIn(tz);

  const { data: entry } = await supabase
    .from("daily_entries")
    .select("id, today_tasks, today_note, tomorrow_plan, reactions(reaction_type), comments(count)")
    .eq("user_id", user.id)
    .eq("entry_date", today)
    .maybeSingle();

  const reactionCount = entry?.reactions?.length ?? 0;
  const commentCount = (entry?.comments as unknown as { count: number }[] | undefined)?.[0]?.count ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hi, {nameOf(profile)} ☀️</h1>
          <p className="mt-1 text-sm text-ink-faint">{formatLongDate(today)}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost text-xs">退出</button>
        </form>
      </header>

      <EntryForm
        groupId={group.id}
        userId={user.id}
        entryDate={today}
        initial={{
          today_tasks: entry?.today_tasks ?? "",
          today_note: entry?.today_note ?? "",
          tomorrow_plan: entry?.tomorrow_plan ?? "",
        }}
      />

      {entry && (reactionCount > 0 || commentCount > 0) && (
        <Link
          href={`/entry/${entry.id}`}
          className="card mt-6 flex items-center justify-between px-5 py-4 text-sm text-ink-soft transition hover:bg-white"
        >
          <span>朋友们给了你 {reactionCount} 个回应{commentCount > 0 && `、${commentCount} 条留言`} 💌</span>
          <MessageCircle className="h-4 w-4" />
        </Link>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
        写多写少都可以，空着也没关系。
      </p>
    </div>
  );
}
