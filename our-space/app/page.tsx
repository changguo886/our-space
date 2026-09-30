import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/LoginForm";
import { Leaf } from "lucide-react";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/today");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 md:p-8">
      <div className="card grid w-full max-w-[1000px] overflow-hidden md:grid-cols-[1.1fr_1fr]">
        <Illustration />
        <div className="flex flex-col items-center justify-center px-6 py-10 md:px-12">
          <Leaf className="h-8 w-8 text-sage-500" strokeWidth={1.8} />
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Our Space</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
            一个只属于我们的
            <br />
            日常记录小空间
          </p>
          <div className="mt-8 w-full max-w-xs">
            <LoginForm initialError={error ? "登录链接已失效或打开方式不对，请重新获取一次～" : null} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Illustration() {
  return (
    <div className="relative h-56 overflow-hidden md:h-auto md:min-h-[440px]">
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E7EEF5" />
            <stop offset="0.55" stopColor="#F7E3DA" />
            <stop offset="1" stopColor="#F9D9C4" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFF4E2" />
            <stop offset="1" stopColor="#F7C9A5" />
          </radialGradient>
        </defs>
        <rect width="400" height="440" fill="url(#sky)" />
        <circle cx="250" cy="275" r="46" fill="url(#sun)" opacity="0.9" />
        <path d="M0 270 Q90 230 180 262 T400 250 V440 H0Z" fill="#C9D3E3" opacity="0.8" />
        <path d="M0 300 Q120 280 220 298 T400 292 V440 H0Z" fill="#AFC0D6" opacity="0.75" />
        <path d="M0 345 Q110 318 210 338 T400 330 V440 H0Z" fill="#B9CDB3" />
        <path d="M0 380 Q140 350 260 372 T400 366 V440 H0Z" fill="#9DB896" />
        <g stroke="#7A9A7E" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
          <path d="M40 440 Q44 400 36 370" />
          <path d="M36 400 q-12 -6 -16 -18" />
          <path d="M40 390 q12 -8 14 -20" />
          <path d="M360 440 Q356 410 364 385" />
          <path d="M358 412 q-12 -4 -16 -16" />
        </g>
      </svg>
      <p className="absolute left-8 top-10 font-hand text-xl leading-loose text-ink/80 md:left-12 md:top-24 md:text-2xl">
        努力生活的人，
        <br />
        <span className="pl-8">从来不是一个人。</span>
        <span className="text-blush-500">♥</span>
      </p>
    </div>
  );
}
