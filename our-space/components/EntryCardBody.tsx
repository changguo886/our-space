type Body = { today_tasks: string | null; today_note: string | null; tomorrow_plan: string | null };

export function EntryBody({ entry, tint }: { entry: Body; tint: string }) {
  const rows = (
    [
      ["今天做了什么？", entry.today_tasks],
      ["今天想说的一句话", entry.today_note],
      ["明天想做什么？", entry.tomorrow_plan],
    ] as const
  ).filter(([, v]) => v && v.trim());

  return (
    <div className={`space-y-3 rounded-2xl ${tint} px-5 py-4`}>
      {rows.length === 0 && <p className="text-sm text-ink-faint">今天什么也没写，但来过了 🌿</p>}
      {rows.map(([q, v]) => (
        <div key={q}>
          <p className="text-xs text-ink-faint">{q}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{v}</p>
        </div>
      ))}
    </div>
  );
}
