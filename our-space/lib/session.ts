import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/utils";

export type Space = {
  id: string;
  name: string;
  invite_code: string;
};

/**
 * 已登录用户 + profile
 * 未登录则回首页
 */
export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, timezone")
    .eq("id", user.id)
    .single<Profile>();

  return {
    supabase,
    user,
    profile:
      profile ??
      ({
        id: user.id,
        email: user.email ?? null,
        display_name: null,
        avatar_url: null,
        timezone: null,
      } as Profile),
  };
}

/**
 * 获取当前用户加入的所有 Spaces
 * 如果一个 Space 都没有，则去 onboarding
 */
export async function requireSpaces() {
  const ctx = await requireUser();

  const { data: memberships, error } = await ctx.supabase
    .from("group_members")
    .select(`
      group_id,
      joined_at,
      groups (
        id,
        name,
        invite_code
      )
    `)
    .eq("user_id", ctx.user.id)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load spaces: ${error.message}`);
  }

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const groups: Space[] = memberships
    .map((membership) => {
      const relation = membership.groups as unknown as
        | Space
        | Space[]
        | null;

      if (Array.isArray(relation)) {
        return relation[0] ?? null;
      }

      return relation;
    })
    .filter((group): group is Space => group !== null);

  if (groups.length === 0) {
    redirect("/onboarding");
  }

  return {
    ...ctx,
    groups,
  };
}

/**
 * 获取当前 active Space
 *
 * 1. 先看 cookie 里有没有 active_space_id
 * 2. 如果有，而且用户确实属于这个 Space，就使用它
 * 3. 如果没有，就默认使用加入的第一个 Space
 *
 * 保留 requireGroup 这个名字，
 * 这样现有页面暂时不需要全部修改。
 */
export async function requireGroup() {
  const ctx = await requireSpaces();

  const cookieStore = await cookies();
  const activeSpaceId = cookieStore.get("active_space_id")?.value;

  const group =
    ctx.groups.find((space) => space.id === activeSpaceId) ??
    ctx.groups[0];

  return {
    ...ctx,
    group,
  };
}
