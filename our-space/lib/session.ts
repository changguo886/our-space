import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/utils";

/** 已登录用户 + 资料；未登录则回到首页 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, timezone")
    .eq("id", user.id)
    .single<Profile>();

  return { supabase, user, profile: profile ?? ({ id: user.id, email: user.email ?? null, display_name: null, avatar_url: null, timezone: null } as Profile) };
}

/** 已登录且已加入小组；否则去 onboarding */
export async function requireGroup() {
  const ctx = await requireUser();
  const { data: membership } = await ctx.supabase
    .from("group_members")
    .select("group_id, groups(id, name, invite_code)")
    .eq("user_id", ctx.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const group = membership.groups as unknown as { id: string; name: string; invite_code: string };
  return { ...ctx, group };
}
