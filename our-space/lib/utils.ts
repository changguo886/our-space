export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
};

export type ReactionType = "hug" | "cheer" | "seen";

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "hug", emoji: "❤️", label: "抱抱" },
  { type: "cheer", emoji: "🌱", label: "加油" },
  { type: "seen", emoji: "👀", label: "看到了" },
];

export const AVATAR_EMOJIS = ["🐰", "🐻", "🐱", "🐶", "🦊", "🐼", "🐨", "🐧", "🌷", "🌙", "☁️", "🍊"];

export const DEFAULT_TZ = "Asia/Shanghai";

export function tzOf(p?: Pick<Profile, "timezone"> | null) {
  return p?.timezone || DEFAULT_TZ;
}

/** 某个时区中"今天"的 YYYY-MM-DD */
export function todayIn(tz: string, d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/** "2026-09-29" → "2026年9月29日 星期二" */
export function formatLongDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}年${m}月${d}日 ${WEEKDAYS[wd]}`;
}

/** entry_date 相对于查看者的今天：今天 / 昨天 / 9月27日 / 2025年9月27日 */
export function relativeDay(ymd: string, viewerTz: string) {
  const today = todayIn(viewerTz);
  const yesterday = todayIn(viewerTz, new Date(Date.now() - 86400000));
  if (ymd === today) return "今天";
  if (ymd === yesterday) return "昨天";
  const [y, m, d] = ymd.split("-").map(Number);
  return y === Number(today.slice(0, 4)) ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

/** 时间戳在查看者时区中的 HH:mm */
export function timeIn(iso: string, tz: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function nameOf(p?: Pick<Profile, "display_name" | "email"> | null) {
  return p?.display_name || p?.email?.split("@")[0] || "朋友";
}

export function hasContent(e: {
  today_tasks: string | null;
  today_note: string | null;
  tomorrow_plan: string | null;
}) {
  return Boolean(e.today_tasks?.trim() || e.today_note?.trim() || e.tomorrow_plan?.trim());
}
