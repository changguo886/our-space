"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import { nameOf, relativeDay, timeIn, todayIn, type Profile } from "@/lib/utils";

export type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: Pick<Profile, "id" | "display_name" | "email" | "avatar_url"> | null;
};

export default function CommentSection({
  entryId,
  userId,
  viewerTz,
  initial,
}: {
  entryId: string;
  userId: string;
  viewerTz: string;
  initial: CommentRow[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient()
      .from("comments")
      .insert({ entry_id: entryId, user_id: userId, content })
      .select("id, user_id, content, created_at, profiles(id, display_name, email, avatar_url)")
      .single();
    setBusy(false);
    if (error) {
      setError("没发出去，再试一次？");
      return;
    }
    setComments([...comments, data as unknown as CommentRow]);
    setText("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("删除这条留言？")) return;
    const prev = comments;
    setComments(comments.filter((c) => c.id !== id));
    const { error } = await createClient().from("comments").delete().eq("id", id);
    if (error) setComments(prev);
    else router.refresh();
  }

  return (
    <section id="comments" className="mt-8 scroll-mt-6">
      <h2 className="text-lg font-semibold">留言</h2>

      <div className="mt-4 space-y-4">
        {comments.length === 0 && <p className="text-sm text-ink-faint">还没有留言，说一句暖心的话吧。</p>}
        {comments.map((c) => (
          <div key={c.id} className="group flex gap-3">
            <Avatar profile={c.profiles} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{nameOf(c.profiles)}</span>
                <span className="ml-2 text-xs text-ink-faint">
                  {relativeDay(todayIn(viewerTz, new Date(c.created_at)), viewerTz)} {timeIn(c.created_at, viewerTz)}
                </span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.content}</p>
            </div>
            {c.user_id === userId && (
              <button
                onClick={() => remove(c.id)}
                aria-label="删除留言"
                className="self-start rounded-lg p-1.5 text-ink-faint opacity-60 transition hover:bg-black/[0.04] hover:text-blush-500 hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={send} className="mt-6 flex items-end gap-2">
        <textarea
          rows={1}
          maxLength={1000}
          className="input min-h-[48px] resize-none"
          placeholder="留下一句鼓励的话…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <button className="btn-primary shrink-0 px-5" disabled={busy || !text.trim()}>
          发送
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-blush-500">{error}</p>}
    </section>
  );
}
