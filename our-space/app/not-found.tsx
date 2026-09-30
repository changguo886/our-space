import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl">🍃</p>
      <p className="text-ink-soft">这里什么也没有，或者你没有权限查看。</p>
      <Link href="/today" className="btn-ghost">回到今天</Link>
    </main>
  );
}
