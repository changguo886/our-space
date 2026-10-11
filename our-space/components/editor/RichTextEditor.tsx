"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Extension, type JSONContent } from "@tiptap/core";
import { EDITOR_COLORS, HIGHLIGHT_COLORS } from "./editorPalette";

type Props = {
  value: JSONContent;
  onChange: (value: JSONContent) => void;
  compact?: boolean;
  spacious?: boolean;
  placeholder?: string;
};

const LocalFontSize = Extension.create({
  name: "localFontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize || null,
          renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
        },
      },
    }];
  },
});

const extensions = [
  StarterKit,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  LocalFontSize,
];

export default function RichTextEditor({ value, onChange, compact = false, spacious = false, placeholder }: Props) {
  const [, refreshToolbar] = useState(0);
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    onUpdate({ editor }) { onChange(editor.getJSON()); },
    onSelectionUpdate() { refreshToolbar(n => n + 1); },
    onTransaction() { refreshToolbar(n => n + 1); },
    editorProps: {
      attributes: {
        class: "ourspace-rich-editor min-h-[150px] w-full rounded-xl px-3 py-4 text-sm leading-7 text-[#4A5048] outline-none focus:outline-none",
      },
    },
  });

  // Data is owned by the caller. When switching to a different note, replace
  // the editor document without creating a feedback loop or undo entry.
  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return <div aria-label="Loading editor" className="min-h-[150px]" />;
  const button = (label: string, title: string, onClick: () => void, active = false) =>
    <button key={title} type="button" title={title} aria-pressed={active}
      onMouseDown={event => event.preventDefault()} onClick={onClick}
      className={`rounded-lg px-2 py-1.5 text-xs transition hover:bg-[#EFF2EB] ${active ? "bg-[#E5EDE2] text-[#456B43]" : "text-[#67746A]"}`}>{label}</button>;

  const swatch = (color: string, label: string, action: () => void, selected = false) =>
    <button key={label} type="button" title={label} aria-label={label} aria-pressed={selected}
      onMouseDown={event => event.preventDefault()} onClick={action}
      className={`h-6 w-6 shrink-0 rounded-full border-2 transition hover:scale-110 ${selected ? "border-[#455F47] ring-2 ring-[#DDE8DA]" : "border-white ring-1 ring-[#D9DED6]"}`}
      style={{ backgroundColor: color }} />;
  const labels: Record<string, string> = { default: "默认", sage: "绿色", amber: "橙色", rose: "粉色", sky: "蓝色", lavender: "紫色" };
  return <div className="w-full min-w-0">
    <div role="toolbar" aria-label="笔记格式" className="mb-2 flex flex-wrap items-center gap-2 border-b border-[#E8EBE5] pb-2">
      <div className="flex items-center gap-1">
        {button("B", "加粗", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {button("I", "斜体", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {button("U", "下划线", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
        {button("1.", "编号列表", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {button("•", "项目列表", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {button("☐", "复选框", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}
        {button("↶", "撤销", () => editor.chain().focus().undo().run())}
        {button("↷", "重做", () => editor.chain().focus().redo().run())}
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="局部字号">
        <span className="mr-1 text-xs text-[#67746A]">字号</span>
        {([["12px", "小"], ["14px", "中"], ["18px", "大"]] as const).map(([size, label]) =>
          button(label, `选区字号：${label}`, () => editor.chain().focus().setMark("textStyle", { fontSize: size }).run(), editor.getAttributes("textStyle").fontSize === size))}
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="文字颜色">
        <span className="mr-1 text-xs text-[#67746A]">文字</span>
        {Object.entries(EDITOR_COLORS).map(([name, color]) =>
          swatch(color, `文字：${labels[name]}`, () => editor.chain().focus().setColor(color).run(), editor.getAttributes("textStyle").color === color))}
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="高亮颜色">
        <span className="mr-1 text-xs text-[#67746A]">高亮</span>
        {swatch("#FFFFFF", "移除高亮", () => editor.chain().focus().unsetHighlight().run(), !editor.isActive("highlight"))}
        {Object.entries(HIGHLIGHT_COLORS).map(([name, color]) =>
          swatch(color, `高亮：${labels[name]}`, () => editor.chain().focus().setHighlight({ color }).run(), editor.isActive("highlight", { color })))}
      </div>
    </div>
    <div className={spacious ? "min-h-[360px] max-h-[65vh] overflow-y-auto" : compact ? "max-h-[250px] overflow-y-auto" : "max-h-[640px] overflow-y-auto"} data-editor-placeholder={placeholder}>
      <EditorContent editor={editor} />
    </div>
    <style jsx global>{`
      .ourspace-rich-editor ul:not([data-type="taskList"]) { list-style-type: disc !important; list-style-position: outside; padding-left: 1.7em !important; margin: .25em 0; }
      .ourspace-rich-editor ol { list-style-type: decimal !important; list-style-position: outside; padding-left: 1.7em !important; margin: .25em 0; }
      .ourspace-rich-editor ul[data-type="taskList"] { list-style: none !important; padding-left: 0 !important; margin: .3em 0; }
      .ourspace-rich-editor ul[data-type="taskList"] > li { display: flex !important; align-items: flex-start; gap: 8px; list-style: none !important; }
      .ourspace-rich-editor ul[data-type="taskList"] > li > label { display: flex; flex: 0 0 auto; align-items: center; padding-top: 4px; cursor: pointer; }
      .ourspace-rich-editor ul[data-type="taskList"] > li > div { flex: 1 1 auto; min-width: 0; width: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ourspace-rich-editor ul[data-type="taskList"] > li > div > p { min-height: 1.4em; }
      .ourspace-rich-editor ul[data-type="taskList"] li[data-checked="true"] > div { color: #9CA69B; text-decoration: line-through; text-decoration-color: #ADB6AA; text-decoration-style: solid; }
      .ourspace-rich-editor p { margin: 0 0 .3em; }
    `}</style>
  </div>;
}
