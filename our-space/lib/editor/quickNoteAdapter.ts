/**
 * Quick Notes editor document adapter (migration foundation).
 *
 * Legacy Markdown stays authoritative until the Tiptap editor and dual-write
 * implementation are validated. Never overwrite content from this preview
 * conversion without an explicit user edit.
 */
export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
};

export type RichTextDocument = {
  type: "doc";
  content: RichTextNode[];
};

function inlineNodes(source: string): RichTextNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\{\{underline\|[^}\n]+\}\}|\{\{(?:color|emphasis):(?:default|sage|amber|rose|sky|lavender)\|[^}\n]+\}\}|==(?:#[0-9a-fA-F]{6}\|)?[^=\n]+==|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  return source.split(pattern).filter(Boolean).map((part): RichTextNode => {
    const mark = (type: string, text: string, attrs?: Record<string, unknown>): RichTextNode =>
      ({ type: "text", text, marks: [{ type, ...(attrs ? { attrs } : {}) }] });
    if (/^\*\*[^*\n]+\*\*$/.test(part)) return mark("bold", part.slice(2, -2));
    if (/^\*[^*\n]+\*$/.test(part)) return mark("italic", part.slice(1, -1));
    const underline = /^\{\{underline\|([^}\n]+)\}\}$/.exec(part);
    if (underline) return mark("underline", underline[1]);
    const styled = /^\{\{(color|emphasis):(default|sage|amber|rose|sky|lavender)\|([^}\n]+)\}\}$/.exec(part);
    if (styled) return mark(styled[1] === "color" ? "textStyle" : "highlight", styled[3], { color: styled[2] });
    const legacyHighlight = /^==(?:([^|=]+)\|)?([^=\n]+)==$/.exec(part);
    if (legacyHighlight) return mark("highlight", legacyHighlight[2], { color: legacyHighlight[1] ?? "amber" });
    const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return mark("link", link[1], { href: link[2] });
    return { type: "text", text: part };
  });
}

export function legacyMarkdownToRichText(content: string): RichTextDocument {
  const nodes: RichTextNode[] = [];
  const lines = content.split(/\r?\n/);
  let listType: "bulletList" | "orderedList" | null = null;
  let list: RichTextNode | null = null;
  for (const line of lines) {
    const task = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (task) {
      listType = null; list = null;
      nodes.push({ type: "taskList", content: [{ type: "taskItem",
        attrs: { checked: task[1].toLowerCase() === "x" },
        content: [{ type: "paragraph", content: inlineNodes(task[2]) }] }] });
      continue;
    }
    const nextType = ordered ? "orderedList" : bullet ? "bulletList" : null;
    if (nextType) {
      if (listType !== nextType || !list) {
        list = { type: nextType, content: [] };
        nodes.push(list);
      }
      listType = nextType;
      list.content!.push({ type: "listItem", content: [{ type: "paragraph", content: inlineNodes((ordered ?? bullet)![1]) }] });
    } else {
      listType = null; list = null;
      nodes.push({ type: "paragraph", content: inlineNodes(line) });
    }
  }
  return { type: "doc", content: nodes };
}

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; content?: unknown };
  return candidate.type === "doc" && Array.isArray(candidate.content);
}

export function getQuickNoteDocument(
  legacyContent: string,
  structuredContent: unknown
): RichTextDocument {
  return isRichTextDocument(structuredContent)
    ? structuredContent
    : legacyMarkdownToRichText(legacyContent);
}
