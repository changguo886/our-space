import { requireGroup } from "@/lib/session";
import Nav from "@/components/Nav";
import TimezoneSync from "@/components/TimezoneSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireGroup();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1040px]">
      <Nav />
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10">{children}</main>
      {!profile.timezone && <TimezoneSync userId={profile.id} />}
    </div>
  );
}
