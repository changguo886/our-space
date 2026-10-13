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
