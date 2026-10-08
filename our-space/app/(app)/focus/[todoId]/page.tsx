import Link from "next/link";

import { notFound } from "next/navigation";

import { requireGroup } from "@/lib/session";
import FocusTimer from "@/components/FocusTimer";
import { getUserPreferences } from "@/lib/preferences";
import { getDictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FocusPage({
  params,
}: {
  params: Promise<{
    todoId: string;
  }>;
}) {
  const { todoId } = await params;

  const {
    supabase,
    user,
  } = await requireGroup();

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

  const preferences =
    await getUserPreferences(
      supabase,
      user.id
    );

  const dictionary =
    getDictionary(
      preferences.language
    );

  const focusText =
    dictionary.focus;

 return (
  <div className="mx-auto max-w-3xl space-y-6">
    <FocusTimer
      todo={todo}
      initialPreferences={preferences}
    />

    <p className="text-center text-xs text-ink-faint">
      {focusText.soundManaged}
      {" "}
      <Link
        href="/settings"
        className="text-sage-700 underline-offset-2 hover:underline"
      >
        {focusText.adjustSound}
      </Link>
    </p>
  </div>
);
}
