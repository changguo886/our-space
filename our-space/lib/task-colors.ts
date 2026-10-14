// Morandi palette: low saturation, warm grey undertone, matching the app's paper/sage look.
export const TASK_COLOR_PRESETS = ["#7E93A8","#8BA388","#9D90AF","#C29B70","#C08F9B","#7FA2A0","#B98583","#9CA27F"] as const;
export const DEFAULT_TASK_COLOR = "#8BA388";
export const LEGACY_JOURNEY_COLORS: Record<string,string> = {
  blue:"#7E93A8",green:"#8BA388",purple:"#9D90AF",orange:"#C29B70",pink:"#C08F9B",teal:"#7FA2A0"
};
/** Saturated presets saved before the Morandi palette, shown with their Morandi counterpart. */
const PREVIOUS_PRESETS: Record<string,string> = {
  "#4B83D1":"#7E93A8","#38A179":"#8BA388","#9268C5":"#9D90AF","#DE9144":"#C29B70",
  "#D9769B":"#C08F9B","#329B9C":"#7FA2A0","#D35F60":"#B98583","#82935A":"#9CA27F"
};
export function normalizeTaskColor(value: string | null | undefined): string {
  if (!value) return DEFAULT_TASK_COLOR;
  const legacy=LEGACY_JOURNEY_COLORS[value.toLowerCase()];
  if(legacy) return legacy;
  if(!/^#[0-9a-f]{6}$/i.test(value)) return DEFAULT_TASK_COLOR;
  const upper=value.toUpperCase();
  return PREVIOUS_PRESETS[upper]??upper;
}

/** Category order used for grouping lists. */
export const CATEGORY_ORDER = ["work","study","life","rest","other","none"] as const;

export const CATEGORY_VISUALS: Record<string,{labelZh:string;labelEn:string;background:string;border:string;accent:string}> = {
  work: {labelZh:"工作",labelEn:"Work",background:"#EEF1F4",border:"#D6DDE4",accent:"#7E93A8"},   // grey blue
  study:{labelZh:"学习",labelEn:"Study",background:"#F5F1E8",border:"#E6DCC8",accent:"#B89E6E"},  // sand
  life: {labelZh:"生活",labelEn:"Life",background:"#EEF2EC",border:"#D5DED1",accent:"#8BA388"},   // sage
  rest: {labelZh:"休息",labelEn:"Rest",background:"#F2EFF5",border:"#DDD6E5",accent:"#9D90AF"},   // grey violet
  other:{labelZh:"其他",labelEn:"Other",background:"#F6EEEE",border:"#E7D5D4",accent:"#B98583"},  // dusty rose
  none: {labelZh:"未分类",labelEn:"Uncategorized",background:"#F3F1ED",border:"#DFDBD4",accent:"#A39D93"}
};

/** The single task-card visual contract, shared by Todo and Calendar surfaces. */
export function taskCardVisual(category:string|null|undefined,color:string|null|undefined) {
  const theme=CATEGORY_VISUALS[category??"none"]??CATEGORY_VISUALS.none;
  return {
    backgroundColor:theme.background,
    borderColor:theme.border,
    borderLeftColor:normalizeTaskColor(color),
    borderLeftWidth:4
  };
}

export function categoryBadgeVisual(category:string|null|undefined) {
 const theme=CATEGORY_VISUALS[category??"none"]??CATEGORY_VISUALS.none;
 return {backgroundColor:theme.background,borderColor:theme.border,color:"#364252"};
}

/** Compact card: a soft category tint that fades to white, plus the task color as a thin left bar. */
export function taskCardCompactVisual(category:string|null|undefined,color:string|null|undefined) {
  const theme=CATEGORY_VISUALS[category??"none"]??CATEGORY_VISUALS.none;
  return {
    background:`linear-gradient(90deg, ${theme.background} 0%, #FFFFFF 55%)`,
    borderColor:theme.border,
    borderLeftColor:normalizeTaskColor(color),
    borderLeftWidth:3
  };
}
