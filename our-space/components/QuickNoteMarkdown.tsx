"use client";

import { createElement, Fragment, type ReactNode } from "react";

type Props = {
  content: string;
  compact?: boolean;
};

// Small, intentionally limited Markdown subset for Quick Notes.
// Render as React text nodes rather than injecting HTML.
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return createElement("strong", { key: index }, part.slice(2, -2));
    }
    const match = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (match) {
      return createElement("a", {
        key: index, href: match[2], target: "_blank",
        rel: "noopener noreferrer", style: { color: "#597356", textDecoration: "underline" },
      }, match[1]);
    }
    return createElement(Fragment, { key: index }, part);
  });
}

export default function QuickNoteMarkdown({ content, compact = false }: Props) {
  const lines = content.split(/\r?\n/);
  const fontSize = compact ? 10 : 12;
  return (
    <div style={{ fontSize, lineHeight: 1.6, color: "inherit", overflowWrap: "anywhere" }}>
      {lines.map((line, index) => {
        const checkbox = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
        if (checkbox) {
          const checked = checkbox[1].toLowerCase() === "x";
          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span aria-label={checked ? "Completed" : "Not completed"} style={{ flexShrink: 0 }}>
                {checked ? "☑" : "☐"}
              </span>
              <span style={{ textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.65 : 1 }}>
                {inline(checkbox[2])}
              </span>
            </div>
          );
        }
        const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
        if (ordered) {
          return <div key={index} style={{ display: "flex", gap: 6 }}>
            <span style={{ flexShrink: 0 }}>{ordered[1]}.</span><span>{inline(ordered[2])}</span>
          </div>;
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return <div key={index} style={{ display: "flex", gap: 7 }}>
            <span aria-hidden="true">•</span><span>{inline(bullet[1])}</span>
          </div>;
        }
        return <div key={index} style={{ minHeight: line ? undefined : "0.8em", whiteSpace: "pre-wrap" }}>
          {inline(line)}
        </div>;
      })}
    </div>
  );
}

export type MarkdownAction = "bold" | "numbered" | "bullet" | "checklist" | "link";

export function applyMarkdownAction(
  value: string,
  start: number,
  end: number,
  action: MarkdownAction
): { content: string; cursor: number } {
  const selection = value.slice(start, end);
  let insert = "";
  switch (action) {
    case "bold": insert = `**${selection || "bold"}**`; break;
    case "numbered": insert = selection ? selection.split("\n").map((v, i) => `${i + 1}. ${v}`).join("\n") : "1. "; break;
    case "bullet": insert = selection ? selection.split("\n").map(v => `- ${v}`).join("\n") : "- "; break;
    case "checklist": insert = selection ? selection.split("\n").map(v => `- [ ] ${v}`).join("\n") : "- [ ] "; break;
    case "link": insert = `[${selection || "link"}](https://)`; break;
  }
  return { content: value.slice(0, start) + insert + value.slice(end), cursor: start + insert.length };
}

export function MarkdownToolbar({
  value, onChange, textarea,
}: {
  value: string;
  onChange: (content: string) => void;
  textarea: HTMLTextAreaElement | null;
}) {
  const actions: { action: MarkdownAction; label: string; title: string }[] = [
    { action: "bold", label: "B", title: "Bold / 加粗" },
    { action: "numbered", label: "1.", title: "Numbered list / 编号" },
    { action: "bullet", label: "•", title: "Bullet list / 列表" },
    { action: "checklist", label: "☐", title: "Checklist / 待办清单" },
    { action: "link", label: "↗", title: "Link / 链接" },
  ];
  return (
    <div role="toolbar" aria-label="Markdown formatting" style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
      {actions.map(({ action, label, title }) => (
        <button key={action} type="button" title={title} aria-label={title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const start = textarea?.selectionStart ?? value.length;
            const end = textarea?.selectionEnd ?? value.length;
            const next = applyMarkdownAction(value, start, end, action);
            onChange(next.content);
            if (textarea) {
              requestAnimationFrame(() => {
                textarea.focus();
                textarea.setSelectionRange(next.cursor, next.cursor);
              });
            }
          }}
          style={{ border: "1px solid #e4e6de", borderRadius: 6, padding: "3px 8px", background: "#fff", color: "#597356", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >{label}</button>
      ))}
    </div>
  );
}
