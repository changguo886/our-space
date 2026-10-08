import { notFound } from "next/navigation";

import FocusTimer from "@/components/FocusTimer";
import DesktopPinButton from "@/components/DesktopPinButton";
import { getUserPreferences } from "@/lib/preferences";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DesktopFocusTimerPage({
  params,
}: {
  params: Promise<{
    todoId: string;
  }>;
}) {
  const { todoId } = await params;
  const { supabase, user } = await requireUser();

  const { data: todo } = await supabase
    .from("todos")
    .select(`
      id,
      title,
      estimated_minutes,
      status,
      started_at,
      elapsed_seconds
    `)
    .eq("id", todoId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!todo) {
    notFound();
  }

  const preferences = await getUserPreferences(
    supabase,
    user.id
  );

  return (
    <main className="min-h-dvh bg-cream px-4 py-4">
      <div className="flex justify-end">
        <DesktopPinButton
          windowLabel={"focus-timer-" + todoId}
        />
      </div>

      <FocusTimer
        todo={todo}
        initialPreferences={preferences}
        disableFloatingWindow
      />
    </main>
  );
}
