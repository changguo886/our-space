"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
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
  StarterKit.configure({ /* Tiptap 3 StarterKit includes undo/redo history. */ }),
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  LocalFontSize,
];

export default function RichTextEditor({ value, onChange, compact = false, placeholder }: Props) {
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    onUpdate({ editor }) { onChange(editor.getJSON()); },
    editorProps: {
      attributes: {
        class: "min-h-[150px] w-full rounded-xl px-3 py-4 text-sm leading-7 text-[#4A5048] outline-none focus:outline-none",
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

  return <div className="w-full min-w-0">
    <div role="toolbar" aria-label="笔记格式" className="mb-2 flex flex-wrap items-center gap-1 border-b border-[#E8EBE5] pb-2">
      {button("B", "加粗", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {button("I", "斜体", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {button("U", "下划线", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      {button("1.", "编号列表", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {button("•", "项目列表", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {button("☐", "复选框", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}
      {button("↶", "撤销", () => editor.chain().focus().undo().run())}
      {button("↷", "重做", () => editor.chain().focus().redo().run())}
      <label className="flex items-center gap-1 text-xs text-[#67746A]">字号
        <select aria-label="选中文字字号" className="rounded-lg border border-[#E8EBE5] bg-white px-1 py-1"
          onChange={event => {
            const size = event.target.value;
            editor.chain().focus().setMark("textStyle", { fontSize: size === "normal" ? null : size }).run();
          }} defaultValue="normal">
          <option value="12px">小</option><option value="normal">中</option><option value="18px">大</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-[#67746A]">文字
        <select aria-label="选中文字颜色" className="rounded-lg border border-[#E8EBE5] bg-white px-1 py-1"
          defaultValue="default" onChange={event => editor.chain().focus().setColor(EDITOR_COLORS[event.target.value as keyof typeof EDITOR_COLORS]).run()}>
          {Object.keys(EDITOR_COLORS).map(key => <option key={key} value={key}>{key === "default" ? "默认" : key}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-[#67746A]">高亮
        <select aria-label="高亮颜色" className="rounded-lg border border-[#E8EBE5] bg-white px-1 py-1" defaultValue=""
          onChange={event => {
            const color = HIGHLIGHT_COLORS[event.target.value as keyof typeof HIGHLIGHT_COLORS];
            if (color) editor.chain().focus().setHighlight({ color }).run();
            else editor.chain().focus().unsetHighlight().run();
          }}>
          <option value="">无</option>
          {Object.keys(HIGHLIGHT_COLORS).map(key => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>
    </div>
    <div className={compact ? "max-h-[250px] overflow-y-auto" : "max-h-[640px] overflow-y-auto"} data-editor-placeholder={placeholder}>
      <EditorContent editor={editor} />
    </div>
    <style jsx global>{`
      .ProseMirror ul { list-style: disc; padding-left: 1.6em; }
      .ProseMirror ol { list-style: decimal; padding-left: 1.6em; }
      .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
      .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: baseline; gap: 8px; }
      .ProseMirror ul[data-type="taskList"] li > label { flex: none; }
      .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { color: #9CA69B; text-decoration: line-through; text-decoration-color: #ADB6AA; text-decoration-style: solid; }
      .ProseMirror p { margin: 0 0 0.3em; }
    `}</style>
  </div>;
}
