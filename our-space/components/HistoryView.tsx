"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EntryBody } from "@/components/EntryCardBody";
import { formatLongDate, hasContent } from "@/lib/utils";

export type HistoryEntry = {
  id: string;
  entry_date: string;
  today_tasks: string | null;
  today_note: string | null;
  tomorrow_plan: string | null;
};

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function HistoryView({ entries, today }: { entries: HistoryEntry[]; today: string }) {
  const byDate = useMemo(() => new Map(entries.map((e) => [e.entry_date, e])), [entries]);
  const [view, setView] = useState<"calendar" | "timeline">("calendar");
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState<string>(byDate.has(today) ? today : entries[0]?.entry_date ?? today);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay();
    const count = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[];
  }, [ym]);

  const shift = (d: number) =>
    setYm(({ y, m }) => {
      const t = m + d;
      return t < 1 ? { y: y - 1, m: 12 } : t > 12 ? { y: y + 1, m: 1 } : { y, m: t };
    });

  const selectedEntry = byDate.get(selected);

  const months = useMemo(() => {
    const groups: { key: string; items: HistoryEntry[] }[] = [];
    for (const e of entries) {
      const key = e.entry_date.slice(0, 7);
      if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
      groups.at(-1)!.items.push(e);
    }
    return groups;
  }, [entries]);

  return (
    <>
      <div className="mt-5 inline-flex rounded-xl bg-black/[0.04] p-1 text-sm">
        {(["calendar", "timeline"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-lg px-4 py-1.5 transition ${view === v ? "bg-paper font-medium shadow-soft" : "text-ink-soft"}`}
          >
            {v === "calendar" ? "日历" : "时间线"}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <>
          <div className="card mt-4 p-4 md:p-6">
            <div className="flex items-center justify-between">
              <button onClick={() => shift(-1)} className="btn-ghost px-2" aria-label="上个月">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="font-medium">
                {ym.y}年 {ym.m}月
              </p>
              <button onClick={() => shift(1)} className="btn-ghost px-2" aria-label="下个月">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-y-1 text-center text-xs text-ink-faint">
              {WEEK.map((w) => (
                <div key={w} className="py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {days.map((d, i) => {
                if (!d) return <div key={`b${i}`} />;
                const date = `${ym.y}-${pad(ym.m)}-${pad(d)}`;
                const has = byDate.has(date);
                const isSel = date === selected;
                const isToday = date === today;
                return (
                  <div key={date} className="flex justify-center">
                    <button
                      onClick={() => setSelected(date)}
                      className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm transition ${
                        isSel
                          ? "bg-sage-500 font-medium text-white"
                          : has
                            ? "bg-sage-100 text-sage-700 hover:bg-sage-300/60"
                            : "text-ink-soft hover:bg-black/[0.04]"
                      } ${isToday && !isSel ? "ring-1 ring-sage-300" : ""}`}
                    >
                      {d}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-ink-soft">{formatLongDate(selected)}</p>
            {selectedEntry ? (
              <Link href={`/entry/${selectedEntry.id}`} className="mt-2 block transition hover:opacity-90">
                <EntryBody entry={selectedEntry} tint="bg-blush-50" />
                <p className="mt-2 text-right text-xs text-ink-faint">查看朋友们的回应 →</p>
              </Link>
            ) : (
              <p className="mt-2 rounded-2xl bg-black/[0.02] px-5 py-6 text-center text-sm text-ink-faint">
                这一天没有记录，也没关系 🌙
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-8">
          {months.length === 0 && <p className="text-sm text-ink-faint">还没有记录。</p>}
          {months.map(({ key, items }) => (
            <section key={key}>
              <h2 className="sticky top-0 z-10 bg-cream/90 py-2 text-sm font-medium text-ink-soft backdrop-blur">
                {Number(key.slice(0, 4))}年{Number(key.slice(5))}月
              </h2>
              <div className="mt-2 space-y-3">
                {items.filter(hasContent).map((e) => (
                  <Link key={e.id} href={`/entry/${e.id}`} className="block transition hover:opacity-90">
                    <p className="mb-1.5 text-xs text-ink-faint">{formatLongDate(e.entry_date)}</p>
                    <EntryBody entry={e} tint="bg-paper border border-line" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
