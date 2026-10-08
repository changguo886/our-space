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
