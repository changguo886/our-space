import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 跨设备也能用的登录链接：?token_hash=...&type=email
// （需要在 Supabase 邮件模板中使用这个地址，见 README）
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") as EmailOtpType | null) ?? "email";

  if (token_hash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/today`);
  }
  return NextResponse.redirect(`${origin}/?error=link`);
}
