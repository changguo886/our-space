import { notFound } from "next/navigation";

import DesktopPinButton from "@/components/DesktopPinButton";
import MiniFocusWorkspace from "@/components/MiniFocusWorkspace";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DesktopFocusWorkspacePage({
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
    .select("id, title")
    .eq("id", todoId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!todo) {
    notFound();
  }

  return (
    <main className="flex min-h-dvh flex-col bg-cream p-3">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Focus Workspace
          </p>

          <h1 className="truncate text-sm font-medium text-ink">
            {todo.title}
          </h1>
        </div>

        <DesktopPinButton
          windowLabel={"focus-workspace-" + todoId}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <MiniFocusWorkspace todoId={todoId} />
      </div>
    </main>
  );
}
