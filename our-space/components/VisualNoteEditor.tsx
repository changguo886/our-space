"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
  placeholder?: string;
};

function appendInline(target: HTMLElement, text: string) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      target.appendChild(strong);
    } else if (/^\\[[^\\]\\n]+\\]\\(https?:\\/\\/[^\\s)]+\\)$/.test(part)) {
      const matched = /^\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)$/.exec(part);
      if (matched) {
        const anchor = document.createElement("a");
        anchor.textContent = matched[1];
        anchor.href = matched[2];
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        target.appendChild(anchor);
      }
    } else {
      target.appendChild(document.createTextNode(part));
    }
  });
}

function buildMarkup(editor: HTMLElement, markdown: string) {
  editor.replaceChildren();
  const lines = markdown.split(/\r?\n/);
  let list: HTMLOListElement | HTMLUListElement | null = null;
  let listType = "";

  lines.forEach((line) => {
    const number = /^\s*\d+\.\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(?!\[[ xX]\]\s)(.*)$/.exec(line);
    const task = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);

    if (number || bullet) {
      const type = number ? "ol" : "ul";
      if (listType !== type || !list) {
        list = document.createElement(type) as HTMLOListElement | HTMLUListElement;
        editor.appendChild(list);
      }
      listType = type;
      const li = document.createElement("li");
      appendInline(li, (number || bullet)![1]);
      list.appendChild(li);
      return;
    }

    list = null;
    listType = "";
    if (task) {
      const row = document.createElement("div");
      row.dataset.task = "true";
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "8px";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = task[1].toLowerCase() === "x";
      check.contentEditable = "false";
      check.style.marginTop = "5px";
      const span = document.createElement("span");
      span.dataset.taskText = "true";
      span.style.flex = "1";
      appendInline(span, task[2]);
      row.append(check, span);
      editor.appendChild(row);
      return;
    }

    const p = document.createElement("div");
    appendInline(p, line);
    if (!line) p.appendChild(document.createElement("br"));
    editor.appendChild(p);
  });
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const children = Array.from(node.childNodes).map(inlineMarkdown).join("");
  if (node.tagName === "STRONG" || node.tagName === "B") return `**${children}**`;
  if (node.tagName === "BR") return "";
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href) ? `[${children}](${href})` : children;
  }
  return children;
}

function serialize(editor: HTMLElement) {
  const output: string[] = [];
  const walk = (element: Element) => {
    const el = element as HTMLElement;
    if (el.dataset.task === "true") {
      const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const label = el.querySelector('[data-task-text]') ?? el;
      output.push(`- [${checkbox?.checked ? "x" : " "}] ${inlineMarkdown(label)}`);
    } else if (el.tagName === "OL" || el.tagName === "UL") {
      Array.from(el.children).forEach((child, index) => {
        if (child.tagName === "LI") {
          output.push(el.tagName === "OL"
            ? `${index + 1}. ${inlineMarkdown(child)}`
            : `- ${inlineMarkdown(child)}`);
        }
      });
    } else if (el.tagName === "DIV" || el.tagName === "P") {
      output.push(inlineMarkdown(el));
    } else if (el.tagName === "LI") {
      output.push("- " + inlineMarkdown(el));
    } else {
      output.push(inlineMarkdown(el));
    }
  };
  Array.from(editor.children).forEach(walk);
  return output.join("\n").replace(/\n+$/, "");
}

export default function VisualNoteEditor({ value, onChange, compact = false, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const emit = () => {
    if (!ref.current) return;
    const next = serialize(ref.current);
    lastEmitted.current = next;
    onChange(next);
  };

  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return;
    buildMarkup(ref.current, value);
    lastEmitted.current = value;
  }, [value]);

  const command = (name: string) => {
    ref.current?.focus();
    document.execCommand(name, false);
    emit();
  };

  const insertTask = () => {
    const editor = ref.current;
    if (!editor) return;
    const row = document.createElement("div");
    row.dataset.task = "true";
    row.style.display = "flex";
    row.style.alignItems = "flex-start";
    row.style.gap = "8px";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.contentEditable = "false";
    box.style.marginTop = "5px";
    const label = document.createElement("span");
    label.dataset.taskText = "true";
    label.style.flex = "1";
    label.appendChild(document.createElement("br"));
    row.append(box, label);
    editor.appendChild(row);
    const range = document.createRange();
    range.selectNodeContents(label);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    emit();
  };

  return (
    <div>
      <div role="toolbar" aria-label="Text formatting" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {[
          { label: "B", title: "Bold / 加粗", action: () => command("bold") },
          { label: "1.", title: "Numbered list / 编号", action: () => command("insertOrderedList") },
          { label: "•", title: "Bullet list / 列表", action: () => command("insertUnorderedList") },
          { label: "☐", title: "Checklist / 待办清单", action: insertTask },
        ].map((item) => (
          <button key={item.title} type="button" title={item.title} aria-label={item.title}
            onMouseDown={(event) => event.preventDefault()} onClick={item.action}
            style={{ padding: "4px 9px", border: "1px solid #dfe5dc", borderRadius: 7, background: "#fff", color: "#597356", fontSize: 12, fontWeight: 600 }}>
            {item.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label={placeholder ?? "Quick note"}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onChange={undefined}
        onClick={(event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") emit();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const selection = window.getSelection();
          let node = selection?.anchorNode ?? null;
          let row: HTMLElement | null = null;
          while (node && node !== ref.current) {
            if (node instanceof HTMLElement && node.dataset.task === "true") { row = node; break; }
            node = node.parentNode;
          }
          if (!row) return; // Native contenteditable already continues numbered/bulleted lists.
          event.preventDefault();
          const label = row.querySelector('[data-task-text]');
          if (!label?.textContent?.trim()) {
            const plain = document.createElement("div");
            plain.appendChild(document.createElement("br"));
            row.replaceWith(plain);
            const range = document.createRange();
            range.selectNodeContents(plain);
            range.collapse(true);
            selection?.removeAllRanges(); selection?.addRange(range);
          } else {
            const next = document.createElement("div");
            next.dataset.task = "true";
            next.style.display = "flex";
            next.style.gap = "8px";
            const box = document.createElement("input");
            box.type = "checkbox"; box.contentEditable = "false";
            const span = document.createElement("span");
            span.dataset.taskText = "true"; span.style.flex = "1";
            span.appendChild(document.createElement("br"));
            next.append(box, span);
            row.after(next);
            const range = document.createRange();
            range.selectNodeContents(span);
            range.collapse(true);
            selection?.removeAllRanges(); selection?.addRange(range);
          }
          emit();
        }}
        data-placeholder={placeholder ?? "Write a note"}
        style={{
          minHeight: compact ? 122 : 144,
          maxHeight: compact ? 240 : 340,
          overflowY: "auto",
          background: "#fff",
          border: "1px solid #e0e6dc",
          borderRadius: 10,
          padding: 12,
          color: "#4a5048",
          fontSize: compact ? 12 : 13,
          lineHeight: 1.7,
          outline: "none",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      />
    </div>
  );
}
