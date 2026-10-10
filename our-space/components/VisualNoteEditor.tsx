"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
  placeholder?: string;
};

function appendInline(target: HTMLElement, text: string) {
  const parts = text.split(/(==(?:#[0-9a-fA-F]{6}\|)?[^=\n]+==|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      target.appendChild(strong);
    } else if (part.startsWith("==") && part.endsWith("==")) {
      const match = /^(?:#[0-9a-fA-F]{6}\|)?(.*)$/.exec(part.slice(2, -2));
      const color = /^#[0-9a-fA-F]{6}\|/.exec(part.slice(2, -2));
      const mark = document.createElement("mark");
      mark.style.backgroundColor = color ? color[0].slice(0, -1) : "#F4D46D";
      mark.style.borderRadius = "3px";
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
      span.style.textDecorationStyle = "dashed";
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
  const [active, setActive] = useState({ bold: false, italic: false, ordered: false, bullet: false, checklist: false });
  const [highlightColor, setHighlightColor] = useState("#F4D46D");
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
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#597356" }}>
          <span>Highlight</span>
          <select aria-label="Highlight color" value={highlightColor} onChange={e=>setHighlightColor(e.target.value)}
            style={{ border: "1px solid #dfe5dc", borderRadius: 6, padding: 4 }}>
            <option value="#F4D46D">Yellow</option>
            <option value="#A9D7B1">Mint</option>
            <option value="#F3A9A5">Pink</option>
            <option value="#A7CBEE">Blue</option>
            <option value="#C8B7E8">Lavender</option>
          </select>
        </label>
        <button type="button" title="Highlight selected text" onMouseDown={e=>e.preventDefault()}
          onClick={()=>{
            const sel=window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed || !ref.current?.contains(sel.anchorNode)) return;
            document.execCommand("hiliteColor", false, highlightColor);
            ref.current.querySelectorAll("span[style*='background'],font[style*='background']").forEach(node=>{
              const mark=document.createElement("mark");
              mark.style.backgroundColor=highlightColor;
              while(node.firstChild)mark.appendChild(node.firstChild);
              node.replaceWith(mark);
            });
            emit(); updateActive();
          }}
          style={{ border:"1px solid #dfe5dc", borderRadius: 6, padding:"4px 8px", color:"#597356",background:"#fff" }}>H</button>
        <select aria-label="Editor font size" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}
          style={{border:"1px solid #dfe5dc", borderRadius:6,padding:4,fontSize:11}}>
          <option value={12}>Small</option><option value={14}>Normal</option><option value={17}>Large</option>
        </select>
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
            if (label) { label.style.textDecoration = event.target.checked ? "line-through" : "none"; label.style.textDecorationStyle = "dashed"; }
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
