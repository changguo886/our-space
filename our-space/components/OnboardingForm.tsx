"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState<"join" | "create">("join");
  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.replace("/");

    await supabase
      .from("profiles")
      .update({
        display_name: name.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .eq("id", user.id);

    const { error } =
      mode === "join"
        ? await supabase.rpc("join_group", { code: code.trim() })
        : await supabase.rpc("create_group", { group_name: groupName.trim() });

    setBusy(false);
    if (error) {
      const m = error.message;
      setError(
        m.includes("invalid invite") ? "没有找到这个邀请码，检查一下？"
        : m.includes("full") ? "这个小组已经满 10 人啦"
        : "出错了：" + m
      );
      return;
    }
    router.replace("/today");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      <div>
        <label className="label">你的名字</label>
        <input className="input" required maxLength={20} placeholder="朋友们会看到这个名字" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex rounded-xl bg-black/[0.04] p-1 text-sm">
        {(["join", "create"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 transition ${mode === m ? "bg-paper font-medium shadow-soft" : "text-ink-soft"}`}
          >
            {m === "join" ? "用邀请码加入" : "创建新小组"}
          </button>
        ))}
      </div>

      {mode === "join" ? (
        <div>
          <label className="label">邀请码</label>
          <input className="input uppercase tracking-widest" required placeholder="例如 3F9A2C7B" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      ) : (
        <div>
          <label className="label">小组名字</label>
          <input className="input" required maxLength={40} placeholder="例如：我们的小角落" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <p className="mt-2 text-xs text-ink-faint">创建后会得到一个邀请码，发给朋友就能加入。</p>
        </div>
      )}

      {error && <p className="text-sm text-blush-500">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "请稍候…" : mode === "join" ? "加入" : "创建"}
      </button>
    </form>
  );
}
