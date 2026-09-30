import { nameOf, type Profile } from "@/lib/utils";

const TINTS = ["bg-blush-100", "bg-mist-100", "bg-sage-100", "bg-[#F5EBDD]"];

export default function Avatar({
  profile,
  size = 40,
}: {
  profile?: Pick<Profile, "id" | "display_name" | "email" | "avatar_url"> | null;
  size?: number;
}) {
  const url = profile?.avatar_url ?? "";
  const tint = TINTS[(profile?.id?.charCodeAt(0) ?? 0) % TINTS.length];
  const style = { width: size, height: size, fontSize: size * 0.5 };

  if (url.startsWith("http")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  const content = url.startsWith("emoji:") ? url.slice(6) : nameOf(profile).slice(0, 1);
  return (
    <span style={style} className={`inline-flex shrink-0 items-center justify-center rounded-full ${tint} font-medium text-ink-soft`}>
      <span style={{ fontSize: url.startsWith("emoji:") ? size * 0.55 : size * 0.42 }}>{content}</span>
    </span>
  );
}
