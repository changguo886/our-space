"use client";
import { MoreHorizontal } from "lucide-react";

export default function RowMenu({ zh, items }: { zh: boolean; items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  return <details className="relative shrink-0">
    <summary aria-label={zh ? "更多操作" : "More actions"} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-ink-soft hover:bg-paper [&::-webkit-details-marker]:hidden">
      <MoreHorizontal className="h-4 w-4" />
    </summary>
    <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-white p-1 shadow-lg">
      {items.map((it) => <button key={it.label} type="button"
        onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); it.onClick(); }}
        className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-paper ${it.danger ? "text-blush-500" : "text-ink"}`}>{it.label}</button>)}
    </div>
  </details>;
}
