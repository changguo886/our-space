"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message.includes("rate") ? "发送太频繁啦，稍等一分钟再试～" : "发送失败：" + error.message);
    else setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError("验证码不对或已过期，再试一次？");
    else router.replace("/today");
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="text-sm leading-relaxed text-ink-soft">
          登录链接已发送到
          <br />
          <span className="font-medium text-ink">{email}</span>
          <br />
          打开邮件，点击链接即可登录 ✉️
        </p>
        <form onSubmit={verifyCode} className="mt-6 space-y-3">
          <p className="text-xs text-ink-faint">如果邮件里有 6 位验证码，也可以直接输入：</p>
          <input
            className="input text-center tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="······"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>
            {busy ? "验证中…" : "用验证码登录"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-blush-500">{error}</p>}
        <button className="btn-ghost mt-4 text-xs" onClick={() => { setSent(false); setCode(""); }}>
          换一个邮箱
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <input
        className="input"
        type="email"
        required
        autoComplete="email"
        placeholder="输入你的邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "发送中…" : "发送登录链接"}
      </button>
      {error && <p className="text-center text-sm text-blush-500">{error}</p>}
      <p className="pt-2 text-center text-xs leading-relaxed text-ink-faint">
        我们会向你的邮箱发送一个登录链接，
        <br />
        点击即可登录，无需设置密码。
      </p>
    </form>
  );
}
