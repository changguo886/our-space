import type { JSONContent } from "@tiptap/core";
import { legacyMarkdownToRichText } from "@/lib/editor/quickNoteAdapter";

/**
 * Compatibility text for older clients. JSON remains the source of truth.
 * Unsupported rich formatting is deliberately flattened ONLY in this
 * compatibility projection, never in the authoritative JSON document.
 */
function inline(node: JSONContent): string {
  if (node.type === "text") {
    let text = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `**${text}**`;
      if (mark.type === "italic") text = `*${text}*`;
      if (mark.type === "underline") text = `{{underline|${text}}}`;
      if (mark.type === "link" && typeof mark.attrs?.href === "string") text = `[${text}](${mark.attrs.href})`;
    }
    return text;
  }
  return (node.content ?? []).map(inline).join("");
}

function block(node: JSONContent): string {
  if (node.type === "paragraph" || node.type === "heading") return inline(node);
  if (node.type === "taskList") return (node.content ?? []).map(item =>
    `- [${item.attrs?.checked ? "x" : " "}] ${(item.content ?? []).map(inline).join("")}`).join("\n");
  if (node.type === "bulletList") return (node.content ?? []).map(item => `- ${inline(item)}`).join("\n");
  if (node.type === "orderedList") return (node.content ?? []).map((item, index) => `${index + 1}. ${inline(item)}`).join("\n");
  return inline(node);
}

export function richTextToLegacyMarkdown(value: JSONContent): string {
  return (value.content ?? []).map(block).join("\n").trim();
}

export function initialRichText(legacy: string, json?: unknown): JSONContent {
  if (json && typeof json === "object" && (json as JSONContent).type === "doc" && Array.isArray((json as JSONContent).content)) {
    return json as JSONContent;
  }
  return legacyMarkdownToRichText(legacy) as JSONContent;
}

export function richTextHasContent(value: JSONContent): boolean {
  return (value.content ?? []).some(node => Boolean(inline(node).trim()) || node.type === "taskList");
}
