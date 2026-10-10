"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
  placeholder?: string;
};

const NOTE_COLORS = [
  { id: "sage", label: "绿", hex: "#62845B" },
  { id: "amber", label: "橙", hex: "#AC7936" },
  { id: "rose", label: "粉", hex: "#B46D7D" },
  { id: "sky", label: "蓝", hex: "#557FA4" },
  { id: "lavender", label: "紫", hex: "#8070A5" },
] as const;

function appendInline(target: HTMLElement, text: string) {
  const parts = text.split(/(\{\{(?:color|emphasis):(?:sage|amber|rose|sky|lavender)\|[^}\n]+\}\}|==(?:#[0-9a-fA-F]{6}\|)?[^=\n]+==|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  parts.forEach((part) => {
    const token = /^\{\{(color|emphasis):(sage|amber|rose|sky|lavender)\|([^}\n]+)\}\}$/.exec(part);
    if (token) {
      const span = document.createElement("span");
      span.dataset.noteStyle = token[1];
      span.dataset.noteColor = token[2];
      span.style.color = NOTE_COLORS.find(item => item.id === token[2])?.hex ?? "#62845B";
      if (token[1] === "emphasis") {
        span.style.textDecoration = "underline";
        span.style.textDecorationColor = "currentColor";
        span.style.textUnderlineOffset = "3px";
      }
      span.textContent = token[3];
      target.appendChild(span);
    } else if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      target.appendChild(strong);
    } else if (part.startsWith("==") && part.endsWith("==")) {
      const match = /^(?:#[0-9a-fA-F]{6}\|)?(.*)$/.exec(part.slice(2, -2));
      const color = /^#[0-9a-fA-F]{6}\|/.exec(part.slice(2, -2));
      const mark = document.createElement("mark");
      mark.style.backgroundColor = "transparent";
      mark.style.color = color ? color[0].slice(0, -1) : "#AC7936";
      mark.style.textDecoration = "underline";
      mark.style.textUnderlineOffset = "3px";
      mark.textContent = match?.[1] ?? part.slice(2, -2);
      target.appendChild(mark);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const em = document.createElement("em"); em.textContent = part.slice(1, -1); target.appendChild(em);
    } else if (/^\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)$/.test(part)) {
      const matched = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
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
        list.style.listStyleType = type === "ol" ? "decimal" : "disc";
        list.style.paddingLeft = "22px";
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
      span.style.textDecoration = check.checked ? "line-through" : "none";
      span.style.textDecorationStyle = "solid";
      span.style.textDecorationColor = "#ADB6AA";
      span.style.color = check.checked ? "#9CA69B" : "inherit";
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
  if (node.tagName === "EM" || node.tagName === "I") return `*${children}*`;
  if (node.dataset.noteStyle && node.dataset.noteColor) return `{{${node.dataset.noteStyle}:${node.dataset.noteColor}|${children}}}`;
  if (node.tagName === "FONT" && node.getAttribute("color")) return children;
  if (node.tagName === "MARK") {
    const color = node.style.backgroundColor;
    const match = color.match(/\d+/g);
    const hex = match && match.length >= 3 ? "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2,"0")).join("") : "#F4D46D";
    return `==${hex}|${children}==`;
  }
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
  const selectedRange = useRef<Range | null>(null);
  const [active, setActive] = useState({ bold: false, italic: false, ordered: false, bullet: false, checklist: false });
  const [highlightColor, setHighlightColor] = useState("amber");
  const [textColor, setTextColor] = useState("sage");
  const [fontSize, setFontSize] = useState(compact ? 12 : 14);
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

  const updateActive = () => {
    const editor = ref.current;
    let node = window.getSelection()?.anchorNode ?? null;
    let bold = false, italic = false, ordered = false, bullet = false, checklist = false;
    if (!editor || !node || !editor.contains(node)) return;
    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) selectedRange.current = selection.getRangeAt(0).cloneRange();
    while (node && node !== editor) {
      if (node instanceof HTMLElement) {
        if (node.tagName === "B" || node.tagName === "STRONG") bold = true;
        if (node.tagName === "EM" || node.tagName === "I") italic = true;
        if (node.tagName === "OL") ordered = true;
        if (node.tagName === "UL") bullet = true;
        if (node.dataset.task === "true") checklist = true;
      }
      node = node.parentNode;
    }
    setActive({ bold, italic, ordered, bullet, checklist });
  };

  const command = (name: string) => {
    const editor = ref.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editor.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor); range.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(range);
    }
    document.execCommand(name, false);
    editor.querySelectorAll("ol,ul").forEach((list) => {
      const el = list as HTMLElement;
      el.style.listStyleType = list.tagName === "OL" ? "decimal" : "disc";
      el.style.paddingLeft = "22px";
    });
    emit(); updateActive();
  };
  const applyInlineColor = (kind: "color" | "emphasis", id: string) => {
    const editor = ref.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;
    const range = selection.rangeCount && !selection.isCollapsed && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0)
      : selectedRange.current;
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const text = range.toString();
    if (!text.trim() || text.includes("\n")) return;
    const span = document.createElement("span");
    span.dataset.noteStyle = kind;
    span.dataset.noteColor = id;
    span.style.color = NOTE_COLORS.find(item => item.id === id)?.hex ?? "#62845B";
    if (kind === "emphasis") {
      span.style.textDecoration = "underline";
      span.style.textUnderlineOffset = "3px";
    }
    try {
      range.surroundContents(span);
    } catch {
      return;
    }
    selection.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.addRange(next);
    selectedRange.current = next.cloneRange();
    emit();
    updateActive();
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
    updateActive();
  };

  return (
    <div>
      <div role="toolbar" aria-label="Text formatting" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {[
          { label: "B", title: "Bold / 加粗", action: () => command("bold"), selected: active.bold },
          { label: "I", title: "Italic / 斜体", action: () => command("italic"), selected: active.italic },
          { label: "1.", title: "Numbered list / 编号", action: () => command("insertOrderedList"), selected: active.ordered },
          { label: "•", title: "Bullet list / 列表", action: () => command("insertUnorderedList"), selected: active.bullet },
          { label: "☐", title: "Checklist / 待办清单", action: insertTask, selected: active.checklist },
        ].map((item) => (
          <button key={item.title} type="button" title={item.title} aria-label={item.title}
            onMouseDown={(event) => event.preventDefault()} onClick={item.action}
            aria-pressed={item.selected}
          style={{ padding: "4px 9px", border: item.selected ? "1px solid #789b72" : "1px solid #dfe5dc", borderRadius: 7, background: item.selected ? "#e1eddd" : "#fff", color: "#597356", fontSize: 12, fontWeight: 600 }}>
            {item.label}
          </button>
        ))}
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11 }}>
          <span>强调</span>
          <select aria-label="文字强调颜色" value={highlightColor} onChange={event => setHighlightColor(event.target.value)}
            style={{ padding: 4, border: "1px solid #dfe5dc", borderRadius: 6 }}>
            {NOTE_COLORS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" title="强调选中文字" onMouseDown={event => event.preventDefault()}
          onClick={() => applyInlineColor("emphasis", highlightColor)}
          style={{ padding: "4px 8px", border: "1px solid #dfe5dc", borderRadius: 6, color: "#62845B", background: "#fff" }}>强调</button>
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11 }}>
          <span>字体颜色</span>
          <select aria-label="字体颜色" value={textColor} onChange={event => setTextColor(event.target.value)}
            style={{ padding: 4, border: "1px solid #dfe5dc", borderRadius: 6 }}>
            {NOTE_COLORS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" title="给选中文字设置颜色" onMouseDown={event => event.preventDefault()}
          onClick={() => applyInlineColor("color", textColor)}
          style={{ padding: "4px 8px", border: "1px solid #dfe5dc", borderRadius: 6, background: "#fff", color: "#62845B" }}>A</button>
        <span role="group" aria-label="字号">
          {[{ label: "小", size: 12 }, { label: "中", size: 14 }, { label: "大", size: 17 }].map(item =>
            <button key={item.label} type="button" title={item.label} aria-pressed={fontSize === item.size}
              onClick={() => setFontSize(item.size)}
              style={{ padding: "3px 6px", fontSize: item.size, border: fontSize === item.size ? "1px solid #789b72" : "1px solid #dfe5dc", background: fontSize === item.size ? "#e1eddd" : "#fff", borderRadius: 6 }}>
              {item.label}
            </button>
          )}
        </span>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label={placeholder ?? "Quick note"}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={() => { emit(); updateActive(); }}
        onKeyUp={updateActive}
        onMouseUp={updateActive}
        onFocus={updateActive}
        onBlur={emit}
        onChange={undefined}
        onClick={(event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
            const label = event.target.parentElement?.querySelector("[data-task-text]") as HTMLElement | null;
            if (label) { label.style.textDecoration = event.target.checked ? "line-through" : "none"; label.style.textDecorationStyle = "solid"; label.style.textDecorationColor = "#ADB6AA"; label.style.color = event.target.checked ? "#9CA69B" : "inherit"; }
            emit();
          }
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
          fontSize,
          lineHeight: 1.7,
          outline: "none",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      />
    </div>
  );
}
