"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NotebookPen,
  Users,
  CalendarDays,
  Settings,
  Leaf,
  ListTodo,
  CalendarRange,
} from "lucide-react";

const ITEMS = [
  {
    href: "/today",
    label: "今天",
    Icon: NotebookPen,
  },
  {
    href: "/todo",
    label: "Todo",
    Icon: ListTodo,
  },
  {
    href: "/calendar",
    label: "日历",
    Icon: CalendarRange,
  },
  {
    href: "/friends",
    label: "朋友们",
    Icon: Users,
  },
  {
    href: "/history",
    label: "历史记录",
    Icon: CalendarDays,
  },
  {
    href: "/settings",
    label: "设置",
    Icon: Settings,
  },
];

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      {/* 桌面：左侧栏 */}
      <aside className="sticky top-0 hidden h-dvh w-48 shrink-0 flex-col gap-1 border-r border-line px-4 py-10 md:flex">
        <Link href="/today" className="mb-8 flex items-center gap-2 px-3 text-sage-700">
          <Leaf className="h-6 w-6 text-sage-500" strokeWidth={1.8} />
          <span className="font-semibold">Our Space</span>
        </Link>
        {ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active(href) ? "bg-sage-100 font-medium text-ink" : "text-ink-soft hover:bg-black/[0.03]"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </aside>

      {/* 手机：底部导航 */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 pt-2.5 text-[11px] ${
                active(href) ? "text-sage-700" : "text-ink-faint"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active(href) ? 2.2 : 1.8} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
