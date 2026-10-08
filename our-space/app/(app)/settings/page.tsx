import { requireGroup } from "@/lib/session";
import { nameOf, type Profile } from "@/lib/utils";

import SettingsForm from "@/components/SettingsForm";
import InviteCode from "@/components/InviteCode";
import Avatar from "@/components/Avatar";
import SpaceManager from "@/components/SpaceManager";
import PreferencesSettings from "@/components/PreferencesSettings";
import { getUserPreferences } from "@/lib/preferences";
import { getDictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const {
    supabase,
    profile,
    group,
    groups,
  } = await requireGroup();

  const preferences =
    await getUserPreferences(
      supabase,
      profile.id
    );

  const dictionary =
    getDictionary(
      preferences.language
    );

  const t =
    dictionary.settings;

  const { data: members } = await supabase
    .from("group_members")
    .select(
      "user_id, joined_at, profiles(id, display_name, email, avatar_url)"
    )
    .eq("group_id", group.id)
    .order("joined_at");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>

      <PreferencesSettings
        userId={profile.id}
        initialPreferences={preferences}
      />

      <section className="card p-5">
        <h2 className="mb-4 font-medium">{t.profileTitle}</h2>
        <SettingsForm profile={profile} />
      </section>

      <section className="card p-5">
        <SpaceManager
          spaces={groups}
          activeSpaceId={group.id}
        />
      </section>

      <section className="card p-5">
        <p className="text-xs text-ink-faint">
          {t.currentSpace}
        </p>

        <h2 className="mt-1 font-medium">
          {group.name}
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          {t.currentSpaceDescription}
        </p>

        <InviteCode code={group.invite_code} />

        <div className="mt-6">
          <h3 className="text-sm font-medium">
            {t.spaceMembers}
          </h3>

          <ul className="mt-4 space-y-3">
            {(members ?? []).map((m) => {
              const p = m.profiles as unknown as Profile;

              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3 text-sm"
                >
                  <Avatar profile={p} size={32} />

                  <span>{nameOf(p)}</span>

                  {m.user_id === profile.id && (
                    <span className="text-xs text-ink-faint">
                      {t.me}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <form
        action="/auth/signout"
        method="post"
        className="text-center"
      >
        <button className="btn-ghost">
          {t.signOut}
        </button>
      </form>
    </div>
  );
}
