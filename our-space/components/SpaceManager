"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Space = {
  id: string;
  name: string;
  invite_code: string;
};

export default function SpaceManager({
  spaces,
  activeSpaceId,
}: {
  spaces: Space[];
  activeSpaceId: string;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"create" | "join">("create");
  const [spaceName, setSpaceName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createSpace(e: React.FormEvent) {
    e.preventDefault();

    const name = spaceName.trim();

    if (!name) {
      setError("请输入空间名字。");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    const { data, error } = await supabase.rpc("create_group", {
      group_name: name,
    });

    setBusy(false);

    if (error) {
      setError("创建失败：" + error.message);
      return;
    }

    const newSpace = data as Space | null;

    if (newSpace?.id) {
      document.cookie =
        `active_space_id=${encodeURIComponent(newSpace.id)}; ` +
        `path=/; max-age=31536000; samesite=lax`;
    }

    setSpaceName("");
    setMessage("新空间已经创建。");

    router.refresh();
  }

  async function joinSpace(e: React.FormEvent) {
    e.preventDefault();

    const code = inviteCode.trim();

    if (!code) {
      setError("请输入邀请码。");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    const { data, error } = await supabase.rpc("join_group", {
      code,
    });

    setBusy(false);

    if (error) {
      const msg = error.message;

      if (msg.includes("invalid invite")) {
        setError("没有找到这个邀请码，请检查一下。");
      } else if (msg.includes("full")) {
        setError("这个空间已经满 10 人了。");
      } else {
        setError("加入失败：" + msg);
      }

      return;
    }

    const joinedSpace = data as Space | null;

    if (joinedSpace?.id) {
      document.cookie =
        `active_space_id=${encodeURIComponent(joinedSpace.id)}; ` +
        `path=/; max-age=31536000; samesite=lax`;
    }

    setInviteCode("");
    setMessage("已经加入这个空间。");

    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium">我的 Spaces</h2>

        <div className="mt-4 space-y-2">
          {spaces.map((space) => (
            <div
              key={space.id}
              className={`rounded-xl border px-4 py-3 ${
                space.id === activeSpaceId
                  ? "border-sage-300 bg-sage-50"
                  : "border-line"
              }`}
            >
              <div className="font-medium">{space.name}</div>

              <div className="mt-1 text-xs text-ink-faint">
                邀请码：{space.invite_code}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex rounded-xl bg-black/[0.04] p-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("create");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-lg py-2 transition ${
            mode === "create"
              ? "bg-paper font-medium shadow-soft"
              : "text-ink-soft"
          }`}
        >
          创建新 Space
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("join");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-lg py-2 transition ${
            mode === "join"
              ? "bg-paper font-medium shadow-soft"
              : "text-ink-soft"
          }`}
        >
          用邀请码加入
        </button>
      </div>

      {mode === "create" ? (
        <form onSubmit={createSpace} className="space-y-3">
          <input
            className="input"
            placeholder="例如：GRE 学习搭子"
            maxLength={40}
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
          />

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "创建中…" : "创建 Space"}
          </button>
        </form>
      ) : (
        <form onSubmit={joinSpace} className="space-y-3">
          <input
            className="input uppercase tracking-widest"
            placeholder="输入邀请码"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "加入中…" : "加入 Space"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm text-blush-500">
          {error}
        </p>
      )}

      {message && (
        <p className="text-sm text-sage-700">
          {message}
        </p>
      )}
    </div>
  );
}
