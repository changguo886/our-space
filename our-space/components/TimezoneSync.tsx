"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 第一次使用时，把浏览器所在时区存到资料里（决定"今天"是哪一天） */
export default function TimezoneSync({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    createClient()
      .from("profiles")
      .update({ timezone: tz })
      .eq("id", userId)
      .then(({ error }) => {
        if (!error) router.refresh();
      });
  }, [userId, router]);
  return null;
}
