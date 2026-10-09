"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import { AVATAR_EMOJIS, tzOf, type Profile } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

export default function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.settings;
  const common = dictionary.common;
  const [name, setName] = useState(profile.display_name ?? "");
  const [avatar, setAvatar] = useState(profile.avatar_url ?? "");
  const [tz, setTz] = useState(tzOf(profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const zones = useMemo(() => {
    const commonZones = [
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Taipei",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Singapore",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Australia/Sydney",
      "Pacific/Auckland",
    ] as const;

    return commonZones.includes(
      tz as (typeof commonZones)[number]
    )
      ? [...commonZones]
      : [tz, ...commonZones];
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
    setMsg(error ? t.profileSaveFailed : common.saved);
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar profile={{ ...profile, display_name: name, avatar_url: avatar }} size={56} />
        <p className="text-xs text-ink-faint">{profile.email}</p>
      </div>

      <div>
        <label className="label">{t.name}</label>
        <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label className="label">{t.avatar}</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAvatar("")}
            className={`h-10 rounded-full px-3 text-xs ${avatar === "" ? "bg-sage-100 ring-2 ring-sage-300" : "bg-black/[0.04]"}`}
          >
            {t.initials}
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
        <label className="label">{t.timezone}</label>
        <select
          className="input"
          value={tz}
          onChange={(e) =>
            setTz(
              e.target.value
            )
          }
        >
          {zones.map((z) => (
            <option
              key={z}
              value={z}
            >
              {(
                t.timezoneOptions as Record<
                  string,
                  string
                >
              )[z] ??
                `${t.timezoneCurrent}: ${z}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="mt-2 text-xs text-sage-700 underline-offset-2 hover:underline"
          onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}
        >
          {t.useDeviceTimezone}
        </button>
        <p className="mt-1 text-xs text-ink-faint">{t.timezoneDescription}</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? common.saving : common.save}</button>
        {msg && (
          <span className="inline-flex items-center gap-1 text-sm text-sage-700">
            {msg === common.saved && <Check className="h-4 w-4" />}
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
