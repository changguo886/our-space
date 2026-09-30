import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import OnboardingForm from "@/components/OnboardingForm";
import { Leaf } from "lucide-react";

export default async function Onboarding() {
  const { supabase, user, profile } = await requireUser();
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/today");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Leaf className="h-7 w-7 text-sage-500" strokeWidth={1.8} />
      <h1 className="mt-3 text-2xl font-semibold">欢迎来到 Our Space</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        先给自己取个名字，然后创建一个小组，或者用朋友给你的邀请码加入。
      </p>
      <OnboardingForm defaultName={profile.display_name ?? ""} />
    </main>
  );
}
