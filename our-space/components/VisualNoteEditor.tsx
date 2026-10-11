"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
  spacious?: boolean;
  placeholder?: string;
};

const NOTE_COLORS = [
  { id: "default", label: "默认", hex: "#4A5048" },
  { id: "sage", label: "绿", hex: "#62845B" },
  { id: "amber", label: "橙", hex: "#AC7936" },
  { id: "rose", label: "粉", hex: "#B46D7D" },
  { id: "sky", label: "蓝", hex: "#557FA4" },
  { id: "lavender", label: "紫", hex: "#8070A5" },
] as const;

function appendInline(target: HTMLElement, text: string) {
  const editor = target;
  const parts = text.split(/(\{\{underline\|[^}\n]+\}\}|\{\{(?:color|emphasis):(?:default|sage|amber|rose|sky|lavender)\|[^}\n]+\}\}|==(?:#[0-9a-fA-F]{6}\|)?[^=\n]+==|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  parts.forEach((part) => {
    const underline = /^\{\{underline\|([^}\n]+)\}\}$/.exec(part);
    if (underline) { const el = editor.ownerDocument.createElement("u"); el.textContent = underline[1]; target.appendChild(el); return; }
    const token = /^\{\{(color|emphasis):(sage|amber|rose|sky|lavender)\|([^}\n]+)\}\}$/.exec(part);
    if (token) {
      const span = editor.ownerDocument.createElement("span");
      span.dataset.noteStyle = token[1];
      span.dataset.noteColor = token[2];
      if (token[1] === "emphasis") {
        span.style.backgroundColor = (NOTE_COLORS.find(item => item.id === token[2])?.hex ?? "#AC7936") + "50";
        span.style.borderRadius = "3px";
      } else {
        span.style.color = NOTE_COLORS.find(item => item.id === token[2])?.hex ?? "#62845B";
      }
      if (token[1] === "color" && token[2] === "default") span.style.color = "#4A5048";
      span.textContent = token[3];
      target.appendChild(span);
    } else if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = editor.ownerDocument.createElement("strong");
      strong.textContent = part.slice(2, -2);
      target.appendChild(strong);
    } else if (part.startsWith("==") && part.endsWith("==")) {
      const match = /^(?:#[0-9a-fA-F]{6}\|)?(.*)$/.exec(part.slice(2, -2));
      const color = /^#[0-9a-fA-F]{6}\|/.exec(part.slice(2, -2));
      const mark = editor.ownerDocument.createElement("mark");
      mark.style.backgroundColor = "transparent";
      mark.style.color = color ? color[0].slice(0, -1) : "#AC7936";
      mark.style.textDecoration = "underline";
      mark.style.textUnderlineOffset = "3px";
      mark.textContent = match?.[1] ?? part.slice(2, -2);
      target.appendChild(mark);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const em = editor.ownerDocument.createElement("em"); em.textContent = part.slice(1, -1); target.appendChild(em);
    } else if (/^\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)$/.test(part)) {
      const matched = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (matched) {
        const anchor = editor.ownerDocument.createElement("a");
        anchor.textContent = matched[1];
        anchor.href = matched[2];
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        target.appendChild(anchor);
      }
    } else {
      target.appendChild(editor.ownerDocument.createTextNode(part));
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
        list = editor.ownerDocument.createElement(type) as HTMLOListElement | HTMLUListElement;
        list.style.listStyleType = type === "ol" ? "decimal" : "disc";
        list.style.paddingLeft = "22px";
        editor.appendChild(list);
      }
      listType = type;
      const li = editor.ownerDocument.createElement("li");
      appendInline(li, (number || bullet)![1]);
      list.appendChild(li);
      return;
    }

    list = null;
    listType = "";
    if (task) {
      const row = editor.ownerDocument.createElement("div");
      row.dataset.task = "true";
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "8px";
      const check = editor.ownerDocument.createElement("input");
      check.type = "checkbox";
      check.checked = task[1].toLowerCase() === "x";
      check.contentEditable = "false";
      check.style.marginTop = "5px";
      const span = editor.ownerDocument.createElement("span");
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

    const p = editor.ownerDocument.createElement("div");
    appendInline(p, line);
    if (!line) p.appendChild(editor.ownerDocument.createElement("br"));
    editor.appendChild(p);
  });
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const children = Array.from(el.childNodes).map(inlineMarkdown).join("");
  if (el.tagName === "STRONG" || el.tagName === "B") return `**${children}**`;
  if (el.tagName === "EM" || el.tagName === "I") return `*${children}*`;
  if (el.tagName === "U") return `{{underline|${children}}}`;
  if (el.dataset.noteStyle && el.dataset.noteColor) return `{{${el.dataset.noteStyle}:${el.dataset.noteColor}|${children}}}`;
  if (el.tagName === "FONT" && el.getAttribute("color")) return children;
  if (el.tagName === "MARK") {
    const color = el.style.backgroundColor;
    const match = color.match(/\d+/g);
    const hex = match && match.length >= 3 ? "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2,"0")).join("") : "#F4D46D";
    return `==${hex}|${children}==`;
  }
  if (el.tagName === "BR") return "";
  if (el.tagName === "A") {
    const href = el.getAttribute("href") ?? "";
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

export default function VisualNoteEditor({ value, onChange, compact = false, spacious = false, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const selectedRange = useRef<Range | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const [active, setActive] = useState({ bold: false, italic: false, ordered: false, bullet: false, checklist: false });
  const [highlightColor, setHighlightColor] = useState("amber");
  const [textColor, setTextColor] = useState("sage");
  const [fontSize, setFontSize] = useState(compact ? 12 : 14);
  const emit = () => {
    if (!ref.current) return;
    const next = serialize(ref.current);
    lastEmitted.current = next;
    if (history.current[historyIndex.current] !== next) {
      history.current = history.current.slice(0, historyIndex.current + 1).concat(next).slice(-100);
      historyIndex.current = history.current.length - 1;
    }
    onChange(next);
  };

  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return;
    buildMarkup(ref.current, value);
    lastEmitted.current = value;
    if (historyIndex.current < 0) { history.current = [value]; historyIndex.current = 0; }
  }, [value]);

  const updateActive = () => {
    const editor = ref.current;
    let node = editor.ownerDocument.defaultView?.getSelection()?.anchorNode ?? null;
    let bold = false, italic = false, ordered = false, bullet = false, checklist = false;
    if (!editor || !node || !editor.contains(node)) return;
    const selection = editor.ownerDocument.defaultView?.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) selectedRange.current = selection.getRangeAt(0).cloneRange();
    while (node && node !== editor) {
      if (node instanceof (editor.ownerDocument.defaultView?.HTMLElement ?? HTMLElement)) {
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
    const sel = editor.ownerDocument.defaultView?.getSelection();
    if (!sel?.rangeCount || !editor.contains(sel.anchorNode)) {
      const range = editor.ownerDocument.createRange();
      range.selectNodeContents(editor); range.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(range);
    }
    editor.ownerDocument.execCommand(name, false);
    editor.querySelectorAll("ol,ul").forEach((list) => {
      const el = list as HTMLElement;
      el.style.listStyleType = list.tagName === "OL" ? "decimal" : "disc";
      el.style.paddingLeft = "22px";
    });
    emit(); updateActive();
  };
  const applyInlineColor = (kind: "color" | "emphasis", id: string) => {
    const editor = ref.current;
    const selection = editor.ownerDocument.defaultView?.getSelection();
    if (!editor || !selection) return;
    const range = selection.rangeCount && !selection.isCollapsed && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0)
      : selectedRange.current;
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const text = range.toString();
    if (!text.trim() || text.includes("\n")) return;
    const span = editor.ownerDocument.createElement("span");
    span.dataset.noteStyle = kind;
    span.dataset.noteColor = id;
    if (kind === "emphasis") {
      span.style.backgroundColor = (NOTE_COLORS.find(item => item.id === id)?.hex ?? "#AC7936") + "50";
      span.style.borderRadius = "3px";
    } else {
      span.style.color = NOTE_COLORS.find(item => item.id === id)?.hex ?? "#62845B";
    }
    try {
      range.surroundContents(span);
    } catch {
      return;
    }
    selection.removeAllRanges();
    const next = editor.ownerDocument.createRange();
    next.selectNodeContents(span);
    selection.addRange(next);
    selectedRange.current = next.cloneRange();
    emit();
    updateActive();
  };

    const travelHistory = (direction: -1 | 1) => {
    const next = historyIndex.current + direction;
    if (next < 0 || next >= history.current.length || !ref.current) return;
    historyIndex.current = next;
    const value = history.current[next];
    buildMarkup(ref.current, value);
    lastEmitted.current = value;
    onChange(value);
    ref.current.focus();
    updateActive();
  };

  const insertTask = () => {
    const editor = ref.current;
    if (!editor) return;
    const selection = ref.current?.ownerDocument.defaultView?.getSelection();
    let node: Node | null = selection?.anchorNode ?? null;
    if (!node || !editor.contains(node)) node = editor.lastChild;
    let row: HTMLElement | null = null;
    while (node && node !== editor) {
      if (node instanceof (editor.ownerDocument.defaultView?.HTMLElement ?? HTMLElement) && (node.dataset.task === "true" || ["DIV","P","LI"].includes(node.tagName))) {
        row = node;
        break;
      }
      node = node.parentNode;
    }
    const makeTask = (content: Node[] = []) => {
      const task = editor.ownerDocument.createElement("div");
      task.dataset.task = "true";
      task.style.display = "flex";
      task.style.gap = "8px";
      const box = editor.ownerDocument.createElement("input");
      box.type = "checkbox"; box.contentEditable = "false";
      const label = editor.ownerDocument.createElement("span");
      label.dataset.taskText = "true"; label.style.flex = "1";
      content.forEach(child => label.appendChild(child));
      if (!label.childNodes.length) label.appendChild(editor.ownerDocument.createElement("br"));
      task.append(box, label);
      return { task, label };
    };
    let target: HTMLElement;
    if (row?.dataset.task === "true") {
      target = editor.ownerDocument.createElement("div");
      const existing = row.querySelector("[data-task-text]");
      if (existing) while (existing.firstChild) target.appendChild(existing.firstChild);
      if (!target.childNodes.length) target.appendChild(editor.ownerDocument.createElement("br"));
      row.replaceWith(target);
    } else if (row?.tagName === "LI" && row.parentElement) {
      const list = row.parentElement;
      const before = Array.from(list.children).slice(0, Array.from(list.children).indexOf(row));
      const after = Array.from(list.children).slice(Array.from(list.children).indexOf(row) + 1);
      const content = Array.from(row.childNodes);
      const result = makeTask(content);
      if (before.length) {
        const first = list.cloneNode(false) as HTMLElement;
        before.forEach(item => first.appendChild(item));
        list.before(first);
      }
      list.before(result.task);
      if (after.length) {
        const tail = list.cloneNode(false) as HTMLElement;
        after.forEach(item => tail.appendChild(item));
        list.before(tail);
      }
      list.remove();
      target = result.label;
    } else if (row) {
      const result = makeTask(Array.from(row.childNodes));
      row.replaceWith(result.task);
      target = result.label;
    } else {
      const result = makeTask();
      editor.appendChild(result.task);
      target = result.label;
    }
    const range = editor.ownerDocument.createRange();
    range.selectNodeContents(target); range.collapse(false);
    selection?.removeAllRanges(); selection?.addRange(range);
    editor.focus(); emit(); updateActive();
  };

  return (
    <div className={spacious ? "mx-auto w-full max-w-[740px]" : "w-full"}>
      <div role="toolbar" aria-label="编辑工具" className="flex flex-wrap items-center gap-1 border-b border-[#E8EBE5] pb-3 mb-3">
        {[
          { label: "B", title: "加粗", action: () => command("bold"), selected: active.bold },
          { label: "I", title: "斜体", action: () => command("italic"), selected: active.italic },
          { label: "U", title: "下划线", action: () => command("underline"), selected: false },
          { label: "1.", title: "编号列表", action: () => command("insertOrderedList"), selected: active.ordered },
          { label: "•", title: "项目列表", action: () => command("insertUnorderedList"), selected: active.bullet },
          { label: "☐", title: "待办清单", action: insertTask, selected: active.checklist },
        ].map((item) => (
          <button key={item.title} type="button" title={item.title} aria-label={item.title}
            onMouseDown={event => event.preventDefault()} onClick={item.action}
            aria-pressed={item.selected}
            className={`min-w-8 rounded-lg px-2 py-1.5 text-sm transition hover:bg-[#EFF2EB] ${item.selected ? "bg-[#E5EDE2] text-[#456B43]" : "text-[#67746A]"}`}>
            {item.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#E1E6DE]" aria-hidden="true" />
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => travelHistory(-1)} title="撤销" aria-label="撤销" className="rounded-lg px-2 py-1.5 text-sm text-[#67746A] hover:bg-[#EFF2EB]">↶</button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => travelHistory(1)} title="重做" aria-label="重做" className="rounded-lg px-2 py-1.5 text-sm text-[#67746A] hover:bg-[#EFF2EB]">↷</button>
        <div className="relative group">
          <button type="button" aria-label="文字颜色" title="文字颜色"
            className="rounded-lg px-2 py-1.5 text-sm text-[#59685D] hover:bg-[#EFF2EB]">
            <span className="border-b-2 border-[#62845B] font-semibold">A</span>
            <span className="ml-1 text-[10px]">⌄</span>
          </button>
          <div className="absolute left-0 top-full z-20 hidden min-w-[160px] rounded-xl border border-[#E1E6DE] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
            <p className="mb-2 px-1 text-[11px] text-[#839086]">字体颜色 · 选择颜色后应用</p>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_COLORS.map(item => <button key={item.id} type="button" aria-label={`字体颜色 ${item.label}`} title={item.label}
                onMouseDown={event => event.preventDefault()} onClick={() => { setTextColor(item.id); applyInlineColor("color", item.id); }}
                className="h-6 w-6 rounded-full border border-black/10 hover:ring-2 hover:ring-[#CEDCCA]"
                style={{ backgroundColor: item.hex }} />)}
            </div>
          </div>
        </div>
        <div className="relative group">
          <button type="button" aria-label="高亮" title="高亮"
            className="rounded-lg px-2 py-1.5 text-sm text-[#59685D] hover:bg-[#EFF2EB]">✦ <span className="text-[10px]">⌄</span></button>
          <div className="absolute left-0 top-full z-20 hidden min-w-[170px] rounded-xl border border-[#E1E6DE] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
            <p className="mb-2 px-1 text-[11px] text-[#839086]">高亮 · 选中文字</p>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_COLORS.map(item => <button key={item.id} type="button" aria-label={`高亮 ${item.label}`} title={item.label}
                onMouseDown={event => event.preventDefault()} onClick={() => { setHighlightColor(item.id); applyInlineColor("emphasis", item.id); }}
                className="h-6 w-6 rounded-md border border-black/10 hover:ring-2 hover:ring-[#CEDCCA]"
                style={{ backgroundColor: item.hex + "55" }} />)}
            </div>
          </div>
        </div>
        <span className="mx-1 h-4 w-px bg-[#E1E6DE]" aria-hidden="true" />
        <div className="relative group">
          <button type="button" aria-label="字号" title="字号"
            className="rounded-lg px-2 py-1.5 text-sm text-[#59685D] hover:bg-[#EFF2EB]">Aa <span className="text-[10px]">⌄</span></button>
          <div className="absolute right-0 top-full z-20 hidden min-w-[116px] rounded-xl border border-[#E1E6DE] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
            {[{label:"小",size:12},{label:"中",size:14},{label:"大",size:17}].map(item =>
              <button key={item.label} type="button" aria-pressed={fontSize===item.size}
                onClick={()=>setFontSize(item.size)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-[#EFF2EB] ${fontSize===item.size?"bg-[#E5EDE2]":""}`}>
                <span style={{fontSize:item.size}}>{item.label}</span><span className="text-[10px] text-[#A0AAA0]">{item.size}</span>
              </button>
            )}
          </div>
        </div>
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
          if ((event.target as HTMLElement).tagName === "INPUT" && (event.target as HTMLInputElement).type === "checkbox") {
            const label = event.target.parentElement?.querySelector("[data-task-text]") as HTMLElement | null;
            if (label) { label.style.textDecoration = event.target.checked ? "line-through" : "none"; label.style.textDecorationStyle = "solid"; label.style.textDecorationColor = "#ADB6AA"; label.style.color = event.target.checked ? "#9CA69B" : "inherit"; }
            emit();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const editor = ref.current;
          if (!editor) return;
          const selection = editor.ownerDocument.defaultView?.getSelection();
          let node = selection?.anchorNode ?? null;
          let row: HTMLElement | null = null;
          while (node && node !== ref.current) {
            if (node.nodeType === 1 && (node as HTMLElement).dataset.task === "true") { row = node as HTMLElement; break; }
            node = node.parentNode;
          }
          if (!row) return; // Native contenteditable already continues numbered/bulleted lists.
          event.preventDefault();
          const label = row.querySelector('[data-task-text]');
          if (!label?.textContent?.trim()) {
            const plain = editor.ownerDocument.createElement("div");
            plain.appendChild(editor.ownerDocument.createElement("br"));
            row.replaceWith(plain);
            const range = editor.ownerDocument.createRange();
            range.selectNodeContents(plain);
            range.collapse(true);
            selection?.removeAllRanges(); selection?.addRange(range);
          } else {
            const next = editor.ownerDocument.createElement("div");
            next.dataset.task = "true";
            next.style.display = "flex";
            next.style.gap = "8px";
            const box = editor.ownerDocument.createElement("input");
            box.type = "checkbox"; box.contentEditable = "false";
            const span = editor.ownerDocument.createElement("span");
            span.dataset.taskText = "true"; span.style.flex = "1";
            span.appendChild(editor.ownerDocument.createElement("br"));
            next.append(box, span);
            row.after(next);
            const range = editor.ownerDocument.createRange();
            range.selectNodeContents(span);
            range.collapse(true);
            selection?.removeAllRanges(); selection?.addRange(range);
          }
          emit();
        }}
        data-placeholder={placeholder ?? "Write a note"}
        style={{
          minHeight: spacious ? 420 : compact ? 122 : 144,
          maxHeight: spacious ? 640 : compact ? 240 : 340,
          overflowY: "auto",
          background: "transparent",
          border: spacious ? "none" : "1px solid #e0e6dc",
          borderRadius: 10,
          padding: spacious ? "18px 4px 50px" : 12,
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
