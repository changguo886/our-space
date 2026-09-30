"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({
  initialError,
}: {
  initialError: string | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setError("邮箱或密码不正确，请再试一次。");
      return;
    }

    router.replace("/today");
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setMessage(null);

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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setError("注册失败：" + error.message);
      return;
    }

    if (data.session) {
      router.replace("/today");
      router.refresh();
      return;
    }

    setMessage(
      "账号已创建，请检查邮箱并完成首次确认。确认后即可使用邮箱和密码登录。"
    );
  }

  async function handleGoogleLogin() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setBusy(false);
      setError("Google 登录失败：" + error.message);
    }
  }

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy}
        onClick={handleGoogleLogin}
      >
        {busy ? "处理中…" : "使用 Google 登录"}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">或</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="输入你的邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            required
            autoComplete="current-password"
            placeholder="输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy}
          >
            {busy ? "登录中…" : "登录"}
          </button>

          <button
            type="button"
            className="btn-ghost w-full text-xs"
            onClick={() => switchMode("signup")}
          >
            第一次来？创建账号
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="space-y-3">
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="输入你的邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="设置密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="再次输入密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建账号"}
          </button>

          <button
            type="button"
            className="btn-ghost w-full text-xs"
            onClick={() => switchMode("login")}
          >
            已经有账号？返回登录
          </button>
        </form>
      )}

      {error && (
        <p className="text-center text-sm text-blush-500">{error}</p>
      )}

      {message && (
        <p className="text-center text-sm leading-relaxed text-sage-700">
          {message}
        </p>
      )}

      <p className="pt-1 text-center text-xs leading-relaxed text-ink-faint">
        登录后会保持会话，平时无需反复打开邮箱。
      </p>
    </div>
  );
}
