export const TASK_COLOR_PRESETS = ["#4B83D1","#38A179","#9268C5","#DE9144","#D9769B","#329B9C","#D35F60","#82935A"] as const;
export const DEFAULT_TASK_COLOR = "#38A179";
export const LEGACY_JOURNEY_COLORS: Record<string,string> = {
  blue:"#4B83D1",green:"#38A179",purple:"#9268C5",orange:"#DE9144",pink:"#D9769B",teal:"#329B9C"
};
export function normalizeTaskColor(value: string | null | undefined): string {
  if (!value) return DEFAULT_TASK_COLOR;
  const legacy=LEGACY_JOURNEY_COLORS[value.toLowerCase()];
  if(legacy) return legacy;
  return /^#[0-9a-f]{6}$/i.test(value)?value.toUpperCase():DEFAULT_TASK_COLOR;
}

export const CATEGORY_VISUALS: Record<string,{labelZh:string;labelEn:string;background:string;border:string;accent:string}> = {
  work:{labelZh:"工作",labelEn:"Work",background:"#E8F1E8",border:"#C9DDCC",accent:"#4C9D68"},
  study:{labelZh:"学习",labelEn:"Study",background:"#FFF4DB",border:"#EBDCB5",accent:"#DDA91B"},
  life:{labelZh:"生活",labelEn:"Life",background:"#E9F2FE",border:"#CADDF5",accent:"#4B90E4"},
  rest:{labelZh:"休息",labelEn:"Rest",background:"#F0EBFC",border:"#DCD0F4",accent:"#946BD3"},
  other:{labelZh:"其他",labelEn:"Other",background:"#FCECEF",border:"#F2D0D8",accent:"#D96B80"},
  none:{labelZh:"未分类",labelEn:"Uncategorized",background:"#F3F1EB",border:"#DDD9D1",accent:"#8E8981"}
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
