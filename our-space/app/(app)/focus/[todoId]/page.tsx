import { notFound } from "next/navigation";

import { requireGroup } from "@/lib/session";
import FocusTimer from "@/components/FocusTimer";

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

  return (
    <div className="mx-auto max-w-3xl">
      <FocusTimer todo={todo} />
    </div>
  );
}
