import type {
  AppLanguage,
} from "@/lib/preferences";

import { en } from "@/lib/i18n/en";
import { zhCN } from "@/lib/i18n/zh-CN";

export const dictionaries = {
  "zh-CN": zhCN,
  en,
} as const;

export type Dictionary =
  (typeof dictionaries)[AppLanguage];

export function getDictionary(
  language: AppLanguage
): Dictionary {
  return dictionaries[language];
}


export function formatYmdLongDate(
  ymd: string,
  language: AppLanguage
) {
  const [
    year,
    month,
    day,
  ] = ymd
    .split("-")
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return new Intl.DateTimeFormat(
    language,
    language === "zh-CN"
      ? {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
          timeZone: "UTC",
        }
      : {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }
  ).format(date);
}
