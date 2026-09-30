import { requireGroup } from "@/lib/session";
import { todayIn, tzOf } from "@/lib/utils";
import HistoryView, { type HistoryEntry } from "@/components/HistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { supabase, user, profile } = await requireGroup();

  const { data } = await supabase
    .from("daily_entries")
    .select("id, entry_date, today_tasks, today_note, tomorrow_plan")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">我的历史记录</h1>
      <HistoryView entries={(data ?? []) as HistoryEntry[]} today={todayIn(tzOf(profile))} />
    </div>
  );
}
