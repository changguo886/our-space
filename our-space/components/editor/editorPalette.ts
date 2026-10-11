/**
 * Palette shared by the Web Quick Notes editor, PiP, and future Journal.
 * Colors are explicit CSS values so the same stored document renders alike.
 */
export const EDITOR_COLORS = {
  default: "#4A5048",
  sage: "#62845B",
  amber: "#AC7936",
  rose: "#B46D7D",
  sky: "#557FA4",
  lavender: "#8070A5",
} as const;

export type EditorColorName = keyof typeof EDITOR_COLORS;

export const HIGHLIGHT_COLORS = {
  sage: "#C7E2BE",
  amber: "#F4E0A9",
  rose: "#F4CDD6",
  sky: "#CBE5F7",
  lavender: "#DFD3F3",
} as const;

export function resolveEditorColor(color: string, kind: "text" | "highlight"): string {
  const palette: Record<string, string> = kind === "text"
    ? EDITOR_COLORS
    : HIGHLIGHT_COLORS;
  if (Object.prototype.hasOwnProperty.call(palette, color)) return palette[color];
  // Older Quick Notes stored #RRGGBB highlight colors.
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return kind === "text" ? EDITOR_COLORS.default : HIGHLIGHT_COLORS.amber;
}
