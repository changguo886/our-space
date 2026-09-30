"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    setBusy(false);

    if (error) {
      setError("设置密码失败：" + error.message);
      return;
    }

    router.replace("/today");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 md:p-8">
      <div className="card w-full max-w-md px-6 py-10 md:px-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">设置新密码</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            设置完成后，以后就可以直接使用邮箱和密码登录。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="输入新密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="再次输入新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy}
          >
            {busy ? "保存中…" : "保存新密码"}
          </button>

          {error && (
            <p className="text-center text-sm text-blush-500">{error}</p>
          )}
        </form>
      </div>
    </main>
  );
}
