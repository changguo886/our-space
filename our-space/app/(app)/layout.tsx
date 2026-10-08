import { requireGroup } from "@/lib/session";

import Nav from "@/components/Nav";
import TimezoneSync from "@/components/TimezoneSync";
import SpaceSelector from "@/components/SpaceSelector";
import GlobalReminderProvider from "@/components/GlobalReminderProvider";
import { getUserPreferences } from "@/lib/preferences";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    supabase,
    profile,
    groups,
    group,
  } = await requireGroup();

  const preferences =
    await getUserPreferences(
      supabase,
      profile.id
    );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1440px]">
      <Nav />

      <GlobalReminderProvider
        userId={profile.id}
        initialPreferences={preferences}
      />

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10 lg:px-10">
        <SpaceSelector
          spaces={groups}
          activeSpaceId={group.id}
        />

        {children}
      </main>

      {!profile.timezone && (
        <TimezoneSync
          userId={profile.id}
        />
      )}
    </div>
  );
}
