"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import { AVATAR_EMOJIS, tzOf, type Profile } from "@/lib/utils";

export default function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name ?? "");
  const [avatar, setAvatar] = useState(profile.avatar_url ?? "");
  const [tz, setTz] = useState(tzOf(profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const zones = useMemo(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
      return list.includes(tz) ? list : [tz, ...list];
    } catch {
      return [tz];
    }
  }, [tz]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient()
      .from("profiles")
      .update({ display_name: name.trim() || null, avatar_url: avatar || null, timezone: tz })
      .eq("id", profile.id);
    setBusy(false);
    setMsg(error ? "保存失败，再试一次？" : "已保存");
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar profile={{ ...profile, display_name: name, avatar_url: avatar }} size={56} />
        <p className="text-xs text-ink-faint">{profile.email}</p>
      </div>

      <div>
        <label className="label">名字</label>
        <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label className="label">头像</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAvatar("")}
            className={`h-10 rounded-full px-3 text-xs ${avatar === "" ? "bg-sage-100 ring-2 ring-sage-300" : "bg-black/[0.04]"}`}
          >
            首字
          </button>
          {AVATAR_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setAvatar(`emoji:${em}`)}
              className={`h-10 w-10 rounded-full text-xl transition ${
                avatar === `emoji:${em}` ? "bg-sage-100 ring-2 ring-sage-300" : "bg-black/[0.03] hover:bg-black/[0.06]"
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">时区</label>
        <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <button
          type="button"
          className="mt-2 text-xs text-sage-700 underline-offset-2 hover:underline"
          onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}
        >
          使用这台设备的时区
        </button>
        <p className="mt-1 text-xs text-ink-faint">决定你的"今天"从什么时候开始。</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        {msg && (
          <span className="inline-flex items-center gap-1 text-sm text-sage-700">
            {msg === "已保存" && <Check className="h-4 w-4" />}
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
