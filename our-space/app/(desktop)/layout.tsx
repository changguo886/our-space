import I18nProvider from "@/components/I18nProvider";
import { getUserPreferences } from "@/lib/preferences";
import { requireUser } from "@/lib/session";

export default async function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    supabase,
    user,
  } = await requireUser();

  const preferences =
    await getUserPreferences(
      supabase,
      user.id
    );

  return (
    <I18nProvider
      initialLanguage={
        preferences.language
      }
      userId={user.id}
    >
      {children}
    </I18nProvider>
  );
}
